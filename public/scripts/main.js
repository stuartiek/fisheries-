// Main frontend script (ready for API / map integration)


//download csv button
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

//vessel search form logic
document.getElementById("vessel-search-form")?.addEventListener("submit", async event => {
    event.preventDefault();

    const query = document.getElementById("vessel-query").value.trim();
    const status = document.getElementById("vessel-search-status");
    const results = document.getElementById("vessel-results");

    status.textContent = "Searching...";
    results.replaceChildren();

    try {
        const response = await fetch(
            `/api/vessels/search?query=${encodeURIComponent(query)}`
        );
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Search failed.");
        }

        const records = (data.entries || []).flatMap(entry =>
            entry.registryInfo?.length
                ? entry.registryInfo
                : entry.selfReportedInfo || []
        );

        for (const record of records) {
            const item = document.createElement("li");
            item.textContent =
                `${record.shipname || "Unknown"} — MMSI: ${record.ssvid || "N/A"} — Flag: ${record.flag || "Unknown"}`;
            results.appendChild(item);
        }

        status.textContent = records.length
            ? `${records.length} result(s).`
            : "No vessels found.";
    } catch (error) {
        status.textContent = error.message;
    }
});

// --- LEAFLET MAP & 4WINGS AREA FILTERING ---
let map;
let gridLayer;
let areaBoxLayer;

document.addEventListener("DOMContentLoaded", () => {
    const mapElement = document.getElementById("map");
    if (!mapElement || typeof L === "undefined") return;

    map = L.map("map").setView([57.8, -1.0], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors | Global Fishing Watch 4Wings"
    }).addTo(map);

    gridLayer = L.layerGroup().addTo(map);
    areaBoxLayer = L.layerGroup().addTo(map);
});

// Update coordinate inputs when a preset area is chosen
document.getElementById("area-preset")?.addEventListener("change", event => {
    const value = event.target.value;
    if (value === "VIEWPORT" && map) {
        const bounds = map.getBounds();
        document.getElementById("min-lat").value = bounds.getSouth().toFixed(2);
        document.getElementById("min-lng").value = bounds.getWest().toFixed(2);
        document.getElementById("max-lat").value = bounds.getNorth().toFixed(2);
        document.getElementById("max-lng").value = bounds.getEast().toFixed(2);
    } else if (value.includes(",")) {
        const [minLat, minLng, maxLat, maxLng] = value.split(",");
        document.getElementById("min-lat").value = minLat;
        document.getElementById("min-lng").value = minLng;
        document.getElementById("max-lat").value = maxLat;
        document.getElementById("max-lng").value = maxLng;
    }
});

// Submit area filter form and plot 4Wings grid cells on Leaflet
document.getElementById("area-filter-form")?.addEventListener("submit", async event => {
    event.preventDefault();

    const status = document.getElementById("area-status");
    const minLat = parseFloat(document.getElementById("min-lat").value);
    const minLng = parseFloat(document.getElementById("min-lng").value);
    const maxLat = parseFloat(document.getElementById("max-lat").value);
    const maxLng = parseFloat(document.getElementById("max-lng").value);
    const startDate = document.getElementById("start-date").value;
    const endDate = document.getElementById("end-date").value;
    const resolution = document.getElementById("spatial-res").value;

    status.textContent = "Loading 4Wings data for selected area...";

    // Draw the selected area bounding box on the map
    if (areaBoxLayer && map) {
        areaBoxLayer.clearLayers();
        const bounds = [[minLat, minLng], [maxLat, maxLng]];
        L.rectangle(bounds, {
            color: "#06b6d4",
            weight: 2,
            dashArray: "6, 6",
            fillOpacity: 0.05
        }).addTo(areaBoxLayer);
        map.fitBounds(bounds, { padding: [20, 20] });
    }

    try {
        const response = await fetch("/api/4wings/area", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minLat, minLng, maxLat, maxLng, startDate, endDate, resolution })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load 4Wings area data.");
        }

        // Flatten 4Wings report entries array
        const records = (data.entries || []).flatMap(entry =>
            Object.values(entry).flat()
        );
        const vesselEvents = data.vesselEvents || [];

        render4WingsData(records, vesselEvents, resolution);
        status.textContent = `Loaded ${records.length} grid cells and ${vesselEvents.length} vessel events in area.`;
    } catch (error) {
        status.textContent = error.message;
    }
});

function render4WingsData(records, vesselEvents, resolution) {
    if (gridLayer) gridLayer.clearLayers();

    const cellSize = resolution === "HIGH" ? 0.01 : 0.1;
    let totalHours = 0;
    const gearCounts = {};
    const flagGearMap = {};

    records.forEach(cell => {
        const lat = Number(cell.lat);
        const lon = Number(cell.lon);
        const hours = Number(cell.hours) || 0;
        const gear = cell.geartype || "Unknown";
        const flag = cell.flag || "UNK";

        totalHours += hours;
        gearCounts[gear] = (gearCounts[gear] || 0) + hours;
        if (!flagGearMap[flag] || gearCounts[gear] > (gearCounts[flagGearMap[flag]] || 0)) {
            flagGearMap[flag] = gear;
        }

        if (gridLayer && !isNaN(lat) && !isNaN(lon)) {
            const color = hours > 20 ? "#ef4444" : hours > 5 ? "#facc15" : "#34d399";
            L.rectangle([[lat, lon], [lat + cellSize, lon + cellSize]], {
                color,
                weight: 1,
                fillColor: color,
                fillOpacity: 0.65
            })
            .bindPopup(
                `<b>Grid Cell:</b> ${lat.toFixed(2)}, ${lon.toFixed(2)}<br>` +
                `<b>Fishing Hours:</b> ${hours.toFixed(2)}h<br>` +
                `<b>Vessels in Cell:</b> ${cell.vesselIDs || 1}<br>` +
                `<b>Gear:</b> ${gear} (${flag})<br>` +
                `<b>Date:</b> ${cell.date || "N/A"}`
            )
            .addTo(gridLayer);
        }
    });

    // Plot individual named vessel event markers on top of the 4Wings heatmap grid
    vesselEvents.forEach(ev => {
        const lat = Number(ev.position?.lat);
        const lon = Number(ev.position?.lon);
        if (gridLayer && !isNaN(lat) && !isNaN(lon)) {
            const name = ev.vessel?.name || "Unnamed Vessel";
            const mmsi = ev.vessel?.ssvid || "N/A";
            const flag = ev.vessel?.flag || "UNK";
            const durationHrs = ev.start && ev.end
                ? ((new Date(ev.end) - new Date(ev.start)) / 3600000).toFixed(1)
                : "—";

            L.circleMarker([lat, lon], {
                radius: 5,
                color: "#ffffff",
                weight: 1.5,
                fillColor: "#06b6d4",
                fillOpacity: 0.95
            })
            .bindPopup(
                `<b>${name}</b> (${flag})<br>` +
                `<b>MMSI:</b> ${mmsi}<br>` +
                `<b>Fishing Duration:</b> ${durationHrs}h<br>` +
                `<b>Position:</b> ${lat.toFixed(3)}, ${lon.toFixed(3)}`
            )
            .addTo(gridLayer);
        }
    });

    // Update KPI Cards
    const uniqueVessels = new Set(vesselEvents.map(ev => ev.vessel?.ssvid || ev.vessel?.id).filter(Boolean));
    document.getElementById("kpi-vessels").textContent = uniqueVessels.size || records.length;
    document.getElementById("kpi-hours").textContent = `${totalHours.toFixed(1)} hrs`;
    const topGear = Object.entries(gearCounts).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("kpi-gear").textContent = topGear ? topGear[0] : "—";

    // Populate Activity Log Table with real named vessels (or grid fallback if no events)
    const tbody = document.getElementById("vessel-tbody");
    tbody.replaceChildren();

    if (vesselEvents.length === 0 && records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="opacity: 0.6;">No fishing activity found in this area/date range.</td></tr>`;
        return;
    }

    if (vesselEvents.length > 0) {
        vesselEvents.slice(0, 100).forEach(ev => {
            const name = ev.vessel?.name || "Unnamed Vessel";
            const mmsi = ev.vessel?.ssvid || "N/A";
            const flag = ev.vessel?.flag || "UNK";
            const gear = flagGearMap[flag] || topGear?.[0] || ev.vessel?.type || "Fishing";
            const dateStr = ev.start ? ev.start.slice(0, 10) : "—";
            const durationHrs = ev.start && ev.end
                ? ((new Date(ev.end) - new Date(ev.start)) / 3600000).toFixed(2)
                : "0.00";
            const lat = Number(ev.position?.lat || 0);
            const lon = Number(ev.position?.lon || 0);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${name}</strong></td>
                <td>${mmsi}</td>
                <td>${flag}</td>
                <td>${gear}</td>
                <td>${ev.type || "fishing"} (${dateStr})</td>
                <td>${durationHrs}</td>
                <td>${lat.toFixed(2)}, ${lon.toFixed(2)}</td>
            `;
            tr.addEventListener("click", () => {
                if (map) map.flyTo([lat, lon], 8);
            });
            tbody.appendChild(tr);
        });
    } else {
        records.slice(0, 100).forEach(cell => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>Grid Cell (${cell.vesselIDs || 1} vessel${cell.vesselIDs === 1 ? "" : "s"})</td>
                <td>—</td>
                <td>${cell.flag || "UNK"}</td>
                <td>${cell.geartype || "Unknown"}</td>
                <td>Fishing (${cell.date || "—"})</td>
                <td>${(Number(cell.hours) || 0).toFixed(2)}</td>
                <td>${Number(cell.lat).toFixed(2)}, ${Number(cell.lon).toFixed(2)}</td>
            `;
            tr.addEventListener("click", () => {
                if (map) map.flyTo([Number(cell.lat), Number(cell.lon)], 8);
            });
            tbody.appendChild(tr);
        });
    }
}
