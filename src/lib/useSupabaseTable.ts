"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type SupabaseRow<T> = {
  id: string;
  data: T | null;
};

export function useSupabaseTable<T extends { id: string }>(
  tableName: string,
  defaultData: T[],
) {
  const mountedRef = useRef(false);
  const reloadTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [subscriptionCycle, setSubscriptionCycle] = useState(0);
  const [data, setDataState] = useState<T[]>(defaultData);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from(tableName)
        .select("id,data")
        .order("id", { ascending: false });

      if (error) {
        console.error(`Failed to load Supabase table "${tableName}"`, error);
        if (mountedRef.current) setDataState([]);
        return;
      }

      const freshData = ((rows ?? []) as SupabaseRow<T>[])
        .map((row) => row.data ?? ({ id: row.id } as T))
        .filter((item): item is T => Boolean(item?.id));

      if (mountedRef.current) setDataState(freshData);
    } catch (error) {
      console.error(`Failed to load Supabase table "${tableName}"`, error);
      if (mountedRef.current) setDataState([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tableName]);

  const scheduleReload = useCallback(() => {
    if (reloadTimeoutRef.current) window.clearTimeout(reloadTimeoutRef.current);
    reloadTimeoutRef.current = window.setTimeout(() => {
      void loadData();
    }, 150);
  }, [loadData]);

  useEffect(() => {
    mountedRef.current = true;
    scheduleReload();

    const channelName = `live-${tableName}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName },
        scheduleReload,
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;

        if (status === "SUBSCRIBED") {
          if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
          return;
        }

        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          scheduleReload();
          if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            void loadData();
            setSubscriptionCycle((current) => current + 1);
          }, 1000);
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };

    const handleOnline = () => scheduleReload();
    const handleFocus = () => scheduleReload();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);

    return () => {
      mountedRef.current = false;
      if (reloadTimeoutRef.current) window.clearTimeout(reloadTimeoutRef.current);
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      void supabase.removeChannel(channel);
    };
  }, [loadData, scheduleReload, subscriptionCycle, tableName]);

  const upsertItem = async (item: T) => {
    setDataState((prev) => {
      const exists = prev.some((current) => current.id === item.id);
      return exists
        ? prev.map((current) => (current.id === item.id ? item : current))
        : [item, ...prev];
    });

    try {
      const { error } = await supabase.from(tableName).upsert({ id: item.id, data: item });
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error(`Failed to upsert Supabase table "${tableName}"`, error);
      await loadData();
    }
  };

  const deleteItem = async (id: string) => {
    setDataState((prev) => prev.filter((item) => item.id !== id));

    try {
      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error(`Failed to delete from Supabase table "${tableName}"`, error);
      await loadData();
    }
  };

  const setAll = async (items: T[]) => {
    setDataState(items);

    try {
      const { error } = await supabase.from(tableName).upsert(items.map((item) => ({ id: item.id, data: item })));
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error(`Failed to replace Supabase table "${tableName}"`, error);
      await loadData();
    }
  };

  return { data, upsertItem, deleteItem, setData: setAll, loading, reload: loadData };
}
