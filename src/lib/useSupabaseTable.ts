"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export function useSupabaseTable<T extends { id: string }>(
  tableName: string,
  defaultData: T[],
) {
  const storageKey = `threefold_${tableName}`;
  const defaultDataRef = useRef(defaultData);
  const [data, setDataState] = useState<T[]>(defaultData);
  const loading = false;

  defaultDataRef.current = defaultData;

  const saveData = useCallback(
    (items: T[]) => {
      localStorage.setItem(storageKey, JSON.stringify(items));
      setDataState(items);
    },
    [storageKey],
  );

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        setDataState(JSON.parse(stored) as T[]);
      } catch (error) {
        console.error(`Failed to parse localStorage table "${tableName}"`, error);
        saveData(defaultDataRef.current);
      }
    } else {
      saveData(defaultDataRef.current);
    }
  }, [saveData, storageKey, tableName]);

  const upsertItem = (item: T) => {
    console.log(`Attempting upsert on table: ${tableName} with item:`, item);

    setDataState((prev) => {
      const exists = prev.some((current) => current.id === item.id);
      const next = exists
        ? prev.map((current) => (current.id === item.id ? item : current))
        : [item, ...prev];

      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });

    void (async () => {
      try {
        const { error } = await supabase.from(tableName).upsert({ id: item.id, data: item });
        if (error) {
          console.log("Supabase response error:", error);
          return;
        }

        console.log("Upsert success, updating state");
      } catch (error) {
        console.log("Supabase response error:", error);
      }
    })();
  };

  const deleteItem = (id: string) => {
    setDataState((prev) => {
      const next = prev.filter((item) => item.id !== id);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const setAll = (items: T[]) => {
    saveData(items);
  };

  return { data, upsertItem, deleteItem, setData: setAll, loading };
}
