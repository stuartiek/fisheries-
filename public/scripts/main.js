// Main frontend script (ready for API / map integration)



function downloadCSV() {
    const table = document.querySelector(".vessel-table");
    const rows = [...table.querySelectorAll("tbody tr")];

    // Ignore the "No data loaded yet" placeholder.
    const dataRows = rows.filter(row => !row.querySelector("[colspan]"));

    if (dataRows.length === 0) {
        alert("No data to download. Load the fishing data first.");
        return;
    }

    function escapeCSV(value) {
        let text = value.trim();

        // Prevent spreadsheet programs from executing text as formulas.
        if (/^[=+\-@]/.test(text)) {
            text = "'" + text;
        }

        return '"' + text.replace(/"/g, '""') + '"';
    }

    const headers = [...table.querySelectorAll("thead th")]
        .map(cell => escapeCSV(cell.textContent))
        .join(",");

    const data = dataRows.map(row =>
        [...row.querySelectorAll("td")]
            .map(cell => escapeCSV(cell.textContent))
            .join(",")
    );

    const csv = "\uFEFF" + [headers, ...data].join("\r\n");
    const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `fishing-data-${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
