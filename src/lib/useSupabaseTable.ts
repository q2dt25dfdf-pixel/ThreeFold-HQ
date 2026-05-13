"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

type SupabaseRow<T> = {
  id: string;
  data: T;
};

export function useSupabaseTable<T extends { id: string }>(
  tableName: string,
  defaultData: T[],
) {
  const [data, setDataState] = useState<T[]>(defaultData);
  const [loading, setLoading] = useState(true);

  const seedDefaults = useCallback(async () => {
    const inserts = defaultData.map((item) => ({
      id: item.id,
      data: item,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from(tableName).upsert(inserts);
      if (error) console.error(`Failed to seed Supabase table "${tableName}"`, error);
    }
    setDataState(defaultData);
  }, [defaultData, tableName]);

  const loadData = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from(tableName)
      .select("id,data")
      .order("id", { ascending: false });

    if (error) {
      console.error(`Failed to load Supabase table "${tableName}"`, error);
      setLoading(false);
      return;
    }

    if (rows && rows.length > 0) {
      setDataState((rows as SupabaseRow<T>[]).map((row) => row.data));
    } else {
      await seedDefaults();
    }
    setLoading(false);
  }, [seedDefaults, tableName]);

  useEffect(() => {
    loadData();

    const subscription = supabase
      .channel(tableName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tableName },
        () => {
          loadData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [loadData, tableName]);

  const upsertItem = async (item: T) => {
    const { error } = await supabase.from(tableName).upsert({ id: item.id, data: item });
    if (error) {
      console.error(`Failed to upsert Supabase table "${tableName}"`, error);
      return;
    }
    setDataState((prev) => {
      const exists = prev.some((current) => current.id === item.id);
      if (exists) return prev.map((current) => (current.id === item.id ? item : current));
      return [item, ...prev];
    });
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from(tableName).delete().eq("id", id);
    if (error) {
      console.error(`Failed to delete from Supabase table "${tableName}"`, error);
      return;
    }
    setDataState((prev) => prev.filter((item) => item.id !== id));
  };

  const setAll = async (items: T[]) => {
    const inserts = items.map((item) => ({
      id: item.id,
      data: item,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from(tableName).upsert(inserts);
      if (error) {
        console.error(`Failed to replace Supabase table "${tableName}"`, error);
        return;
      }
    }
    setDataState(items);
  };

  return { data, setData: setAll, upsertItem, deleteItem, loading };
}
