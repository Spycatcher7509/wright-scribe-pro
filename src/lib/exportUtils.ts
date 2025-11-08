export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }

  // Get headers from the first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    // Header row
    headers.join(","),
    // Data rows
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Handle different data types
        if (value === null || value === undefined) return "";
        if (typeof value === "object") return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        if (typeof value === "string" && value.includes(",")) return `"${value.replace(/"/g, '""')}"`;
        return value;
      }).join(",")
    )
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToJSON = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    throw new Error("No data to export");
  }

  // Create JSON content
  const jsonContent = JSON.stringify(data, null, 2);

  // Create blob and download
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const formatActivityLogsForExport = (logs: any[], users: any[]) => {
  return logs.map(log => {
    const user = users?.find(u => u.id === log.user_id);
    return {
      id: log.id,
      timestamp: new Date(log.created_at).toISOString(),
      user_email: user?.email || "Unknown",
      user_group: user?.user_group || "N/A",
      action_type: log.action_type,
      action_description: log.action_description,
      metadata: log.metadata,
    };
  });
};
