import { createContext, useContext, useMemo, useState } from "react";

const StudentShellContext = createContext(null);

export function StudentShellProvider({ children }) {
  const [search, setSearch] = useState("");
  const [filterPlumbing, setFilterPlumbing] = useState(false);
  const [filterElectrical, setFilterElectrical] = useState(false);
  const [filterSafety, setFilterSafety] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusInProgress, setStatusInProgress] = useState(false);
  const [statusResolved, setStatusResolved] = useState(false);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      filterPlumbing,
      setFilterPlumbing,
      filterElectrical,
      setFilterElectrical,
      filterSafety,
      setFilterSafety,
      statusOpen,
      setStatusOpen,
      statusInProgress,
      setStatusInProgress,
      statusResolved,
      setStatusResolved,
    }),
    [
      search,
      filterPlumbing,
      filterElectrical,
      filterSafety,
      statusOpen,
      statusInProgress,
      statusResolved,
    ]
  );

  return <StudentShellContext.Provider value={value}>{children}</StudentShellContext.Provider>;
}

export function useStudentShell() {
  const ctx = useContext(StudentShellContext);
  if (!ctx) {
    throw new Error("useStudentShell must be used within StudentShellProvider");
  }
  return ctx;
}
