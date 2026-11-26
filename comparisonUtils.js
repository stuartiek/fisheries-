const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 86400000;

function parseIsoDate(dateStr) {
    if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return null;
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    return date;
}

function formatIsoDate(dateObj) {
    return dateObj.toISOString().slice(0, 10);
}

function getRangeDays(startDateStr, endDateStr) {
    const start = parseIsoDate(startDateStr);
    const end = parseIsoDate(endDateStr);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

function validateCompareRequest(body) {
    const {
        minLat,
        minLng,
        maxLat,
        maxLng,
        periodAStart,
        periodAEnd,
        periodBStart,
        periodBEnd,
        resolution = 'LOW',
        timeframe = 'custom'
    } = body || {};

    const coords = [minLat, minLng, maxLat, maxLng].map(Number);
    if (coords.some(value => !Number.isFinite(value))) {
        return { valid: false, error: 'Valid numeric bounding-box coordinates are required.' };
    }
    if (coords[0] >= coords[2] || coords[1] >= coords[3]) {
        return { valid: false, error: 'Min latitude/longitude must be less than max latitude/longitude.' };
    }

    const daysA = getRangeDays(periodAStart, periodAEnd);
    const daysB = getRangeDays(periodBStart, periodBEnd);
    if (daysA === null || daysB === null) {
        return { valid: false, error: 'All comparison dates must use YYYY-MM-DD format.' };
    }
    if (daysA < 1 || daysB < 1) {
        return { valid: false, error: 'Each period end date must be on or after its start date.' };
    }
    if (daysA > MAX_RANGE_DAYS || daysB > MAX_RANGE_DAYS) {
        return { valid: false, error: `Each period cannot exceed ${MAX_RANGE_DAYS} days.` };
    }

    return {
        valid: true,
        value: {
            minLat: coords[0],
            minLng: coords[1],
            maxLat: coords[2],
            maxLng: coords[3],
            periodAStart,
            periodAEnd,
            periodBStart,
            periodBEnd,
            daysA,
            daysB,
            resolution: resolution === 'HIGH' ? 'HIGH' : 'LOW',
            timeframe
        }
    };
}

function buildPresetRanges(timeframe, anchorEndDateStr = '2025-09-15') {
    const anchorEnd = parseIsoDate(anchorEndDateStr);
    if (!anchorEnd) throw new Error('Invalid anchor date.');

    const addDays = (dateObj, delta) => {
        const copy = new Date(dateObj.getTime());
        copy.setUTCDate(copy.getUTCDate() + delta);
        return copy;
    };

    if (timeframe === 'weekly') {
        const periodBEnd = anchorEnd;
        const periodBStart = addDays(periodBEnd, -6);
        const periodAEnd = addDays(periodBStart, -1);
        const periodAStart = addDays(periodAEnd, -6);
        return {
            periodAStart: formatIsoDate(periodAStart),
            periodAEnd: formatIsoDate(periodAEnd),
            periodBStart: formatIsoDate(periodBStart),
            periodBEnd: formatIsoDate(periodBEnd)
        };
    }

    if (timeframe === 'monthly') {
        const periodBEnd = anchorEnd;
        const periodBStart = addDays(periodBEnd, -29);
        const periodAEnd = addDays(periodBStart, -1);
        const periodAStart = addDays(periodAEnd, -29);
        return {
            periodAStart: formatIsoDate(periodAStart),
            periodAEnd: formatIsoDate(periodAEnd),
            periodBStart: formatIsoDate(periodBStart),
            periodBEnd: formatIsoDate(periodBEnd)
        };
    }

    if (timeframe === 'yearly') {
        const periodBEnd = anchorEnd;
        const periodBStart = addDays(periodBEnd, -29);
        const shiftYear = (dateObj, years) => {
            const exact = new Date(Date.UTC(
                dateObj.getUTCFullYear() + years,
                dateObj.getUTCMonth(),
                dateObj.getUTCDate()
            ));
            if (exact.getUTCMonth() === dateObj.getUTCMonth()) return exact;
            return new Date(Date.UTC(dateObj.getUTCFullYear() + years, dateObj.getUTCMonth(), 28));
        };
        return {
            periodAStart: formatIsoDate(shiftYear(periodBStart, -1)),
            periodAEnd: formatIsoDate(shiftYear(periodBEnd, -1)),
            periodBStart: formatIsoDate(periodBStart),
            periodBEnd: formatIsoDate(periodBEnd)
        };
    }

    return null;
}

function flatten4WingsEntries(reportData) {
    return (reportData?.entries || []).flatMap(entry => Object.values(entry).flat());
}

function summarizePeriod(records, vesselEvents) {
    let totalHours = 0;
    const gearHours = {};
    const flagHours = {};
    const activeCells = new Set();

    for (const cell of records || []) {
        const hours = Number(cell.hours) || 0;
        const gear = cell.geartype || 'Unknown';
        const flag = cell.flag || 'UNK';
        totalHours += hours;
        gearHours[gear] = (gearHours[gear] || 0) + hours;
        flagHours[flag] = (flagHours[flag] || 0) + hours;
        if (cell.lat !== undefined && cell.lon !== undefined) {
            activeCells.add(`${Number(cell.lat).toFixed(2)},${Number(cell.lon).toFixed(2)}`);
        }
    }

    const uniqueVessels = new Set(
        (vesselEvents || [])
            .map(event => event.vessel?.ssvid || event.vessel?.id)
            .filter(Boolean)
    );

    const sortedGears = Object.entries(gearHours).sort((a, b) => b[1] - a[1]);
    const sortedFlags = Object.entries(flagHours).sort((a, b) => b[1] - a[1]);

    return {
        totalHours: Number(totalHours.toFixed(2)),
        recordCount: (records || []).length,
        activeCells: activeCells.size,
        vesselEventCount: (vesselEvents || []).length,
        uniqueVessels: uniqueVessels.size || (records || []).length,
        topGear: sortedGears[0]?.[0] || 'None',
        topGearHours: Number((sortedGears[0]?.[1] || 0).toFixed(2)),
        topFlag: sortedFlags[0]?.[0] || 'None',
        gearHours,
        flagHours
    };
}

function computeDelta(baseVal, compVal) {
    const diff = Number((compVal - baseVal).toFixed(2));
    if (baseVal === 0) {
        return {
            diff,
            percentChange: compVal === 0 ? 0 : null,
            direction: compVal > 0 ? 'up' : compVal < 0 ? 'down' : 'flat'
        };
    }
    const pct = Number((((compVal - baseVal) / baseVal) * 100).toFixed(1));
    return {
        diff,
        percentChange: pct,
        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
    };
}

function buildBreakdownComparison(mapA, mapB) {
    const keys = new Set([...Object.keys(mapA || {}), ...Object.keys(mapB || {})]);
    return [...keys]
        .map(key => {
            const hoursA = Number((mapA?.[key] || 0).toFixed(2));
            const hoursB = Number((mapB?.[key] || 0).toFixed(2));
            const delta = computeDelta(hoursA, hoursB);
            return {
                label: key,
                hoursA,
                hoursB,
                diff: delta.diff,
                percentChange: delta.percentChange,
                direction: delta.direction
            };
        })
        .sort((a, b) => (b.hoursA + b.hoursB) - (a.hoursA + a.hoursB));
}

function comparePeriods(summaryA, summaryB) {
    return {
        totalHours: computeDelta(summaryA.totalHours, summaryB.totalHours),
        uniqueVessels: computeDelta(summaryA.uniqueVessels, summaryB.uniqueVessels),
        activeCells: computeDelta(summaryA.activeCells, summaryB.activeCells),
        vesselEvents: computeDelta(summaryA.vesselEventCount, summaryB.vesselEventCount),
        gearBreakdown: buildBreakdownComparison(summaryA.gearHours, summaryB.gearHours),
        flagBreakdown: buildBreakdownComparison(summaryA.flagHours, summaryB.flagHours)
    };
}

module.exports = {
    MAX_RANGE_DAYS,
    parseIsoDate,
    formatIsoDate,
    getRangeDays,
    validateCompareRequest,
    buildPresetRanges,
    flatten4WingsEntries,
    summarizePeriod,
    computeDelta,
    buildBreakdownComparison,
    comparePeriods
};
