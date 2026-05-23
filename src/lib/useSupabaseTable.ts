"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type SupabaseRow<T> = {
  id: string;
  data: T | null;
};

type MutationResponse = Awaited<ReturnType<ReturnType<typeof supabase.from>["upsert"]>>;

// How often to poll as a fallback when the realtime subscription has not fired.
// The postgres_changes subscription fires immediately when Supabase Realtime is
// enabled for a table (see supabase/enable-realtime.sql). Polling ensures the
// page is always fresh even if realtime is not configured or the websocket drops.
const POLL_INTERVAL_MS = 30_000;

export function useSupabaseTable<T extends { id: string }>(
  tableName: string,
  defaultData: T[],
) {
  const mountedRef = useRef(false);
  const reloadTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const hasLoadedRef = useRef(false);
  const [subscriptionCycle, setSubscriptionCycle] = useState(0);
  const [data, setDataState] = useState<T[]>(defaultData);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      setErrorMessage("");
      const { data: rows, error } = await supabase
        .from(tableName)
        .select("id,data")
        .order("id", { ascending: false });

      if (error) {
        console.error(`Failed to load Supabase table "${tableName}"`, error);
        // 42P01 = PostgreSQL "undefined_table" — treat as empty, not an error
        const isTableMissing = (error as { code?: string }).code === "42P01";
        if (!isTableMissing && mountedRef.current) {
          setErrorMessage(`Couldn't load ${tableName.replaceAll("_", " ")}. Please try again.`);
        }
        if (mountedRef.current) setDataState([]);
        return;
      }

      const freshData = ((rows ?? []) as SupabaseRow<T>[])
        .map((row) => row.data ?? ({ id: row.id } as T))
        .filter((item): item is T => Boolean(item?.id));

      if (mountedRef.current) setDataState(freshData);
    } catch (error) {
      console.error(`Failed to load Supabase table "${tableName}"`, error);
      if (mountedRef.current) setErrorMessage(`Couldn't load ${tableName.replaceAll("_", " ")}. Please try again.`);
      if (mountedRef.current) setDataState([]);
    } finally {
      if (mountedRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
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

    // ── Realtime subscription ─────────────────────────────────────────────────
    // Fires immediately when the table is in the supabase_realtime publication.
    // Run the SQL in supabase/enable-realtime.sql once to activate this for all
    // HQ tables. Until then, the poll interval below keeps data fresh.
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

    // ── Polling fallback ──────────────────────────────────────────────────────
    // Keeps pages fresh every 30 s when the realtime subscription does not fire
    // (e.g. tables not yet in the publication, or websocket silently dropped).
    // Uses scheduleReload so the debounce prevents a collision with a near-
    // simultaneous realtime event.
    if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleReload();
    }, POLL_INTERVAL_MS);

    // ── Browser-level refresh triggers ───────────────────────────────────────
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
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      void supabase.removeChannel(channel);
    };
  }, [loadData, scheduleReload, subscriptionCycle, tableName]);

  const upsertItem = async (item: T): Promise<MutationResponse> => {
    setDataState((prev) => {
      const exists = prev.some((current) => current.id === item.id);
      return exists
        ? prev.map((current) => (current.id === item.id ? item : current))
        : [item, ...prev];
    });

    try {
      const response = await supabase.from(tableName).upsert({ id: item.id, data: item });
      if (response.error) {
        console.error(`Failed to upsert Supabase table "${tableName}"`, response.error);
        const isTableMissing = (response.error as { code?: string }).code === "42P01";
        await loadData();
        if (!isTableMissing && mountedRef.current) {
          setErrorMessage(`Couldn't save changes to ${tableName.replaceAll("_", " ")}.`);
        }
        return response;
      }

      if (mountedRef.current) setErrorMessage("");
      await loadData();
      return response;
    } catch (error) {
      console.error(`Failed to upsert Supabase table "${tableName}"`, error);
      const isTableMissing = (error as { code?: string })?.code === "42P01";
      await loadData();
      if (!isTableMissing && mountedRef.current) {
        setErrorMessage(`Couldn't save changes to ${tableName.replaceAll("_", " ")}.`);
      }
      return { data: null, error, count: null, status: 0, statusText: "Client exception" } as MutationResponse;
    }
  };

  const deleteItem = async (id: string): Promise<{ error: unknown | null }> => {
    setDataState((prev) => prev.filter((item) => item.id !== id));

    try {
      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;
      if (mountedRef.current) setErrorMessage("");
      await loadData();
      return { error: null };
    } catch (error) {
      console.error(`Failed to delete from Supabase table "${tableName}"`, error);
      await loadData();
      if (mountedRef.current) setErrorMessage(`Couldn't delete from ${tableName.replaceAll("_", " ")}.`);
      return { error };
    }
  };

  const setAll = async (items: T[]) => {
    setDataState(items);

    try {
      const { error } = await supabase.from(tableName).upsert(items.map((item) => ({ id: item.id, data: item })));
      if (error) throw error;
      if (mountedRef.current) setErrorMessage("");
      await loadData();
    } catch (error) {
      console.error(`Failed to replace Supabase table "${tableName}"`, error);
      await loadData();
      if (mountedRef.current) setErrorMessage(`Couldn't save changes to ${tableName.replaceAll("_", " ")}.`);
    }
  };

  return { data, upsertItem, deleteItem, setData: setAll, loading, error: errorMessage, reload: loadData };
}
