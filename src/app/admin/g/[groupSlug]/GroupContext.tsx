"use client";

import React, { createContext, useContext } from "react";

type GroupContextType = {
  id: string;
  name: string;
  slug: string;
};

const GroupContext = createContext<GroupContextType | null>(null);

export function GroupProvider({
  children,
  group,
}: {
  children: React.ReactNode;
  group: GroupContextType;
}) {
  return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return context;
}
