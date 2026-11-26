const assert = require('assert');
const {
    parseIsoDate,
    getRangeDays,
    validateCompareRequest,
    buildPresetRanges,
    flatten4WingsEntries,
    summarizePeriod,
    computeDelta,
    comparePeriods
} = require('../comparisonUtils');

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`PASS: ${name}`);
    } catch (error) {
        console.error(`FAIL: ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

test('parseIsoDate validates date format and rejects impossible dates', () => {
    assert.ok(parseIsoDate('2025-09-15') instanceof Date);
    assert.strictEqual(parseIsoDate('2025-02-30'), null);
    assert.strictEqual(parseIsoDate('15-09-2025'), null);
});

test('getRangeDays counts both start and end dates', () => {
    assert.strictEqual(getRangeDays('2025-09-01', '2025-09-01'), 1);
    assert.strictEqual(getRangeDays('2025-09-01', '2025-09-07'), 7);
    assert.strictEqual(getRangeDays('2025-09-10', '2025-09-01'), -8);
});

test('buildPresetRanges returns adjacent weekly, monthly, and yearly periods', () => {
    const weekly = buildPresetRanges('weekly', '2025-09-15');
    assert.deepStrictEqual(weekly, {
        periodAStart: '2025-09-02',
        periodAEnd: '2025-09-08',
        periodBStart: '2025-09-09',
        periodBEnd: '2025-09-15'
    });

    const monthly = buildPresetRanges('monthly', '2025-09-15');
    assert.strictEqual(getRangeDays(monthly.periodAStart, monthly.periodAEnd), 30);
    assert.strictEqual(getRangeDays(monthly.periodBStart, monthly.periodBEnd), 30);

    const yearly = buildPresetRanges('yearly', '2025-09-15');
    assert.strictEqual(yearly.periodAStart, '2024-08-17');
    assert.strictEqual(yearly.periodAEnd, '2024-09-15');
    assert.strictEqual(buildPresetRanges('yearly', '2024-02-29').periodAEnd, '2023-02-28');
    assert.strictEqual(buildPresetRanges('custom', '2025-09-15'), null);
});

test('validateCompareRequest rejects invalid values and periods longer than 366 days', () => {
    const request = {
        minLat: 56, minLng: -3, maxLat: 60, maxLng: 2,
        periodAStart: '2025-08-01', periodAEnd: '2025-08-30',
        periodBStart: '2025-09-01', periodBEnd: '2025-09-30',
        resolution: 'HIGH', timeframe: 'monthly'
    };
    const valid = validateCompareRequest(request);
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.value.daysA, 30);
    assert.strictEqual(valid.value.resolution, 'HIGH');
    assert.strictEqual(validateCompareRequest({ ...request, minLat: Infinity }).valid, false);
    assert.strictEqual(validateCompareRequest({ ...request, periodAStart: '2025-09-10', periodAEnd: '2025-09-01' }).valid, false);
    assert.strictEqual(validateCompareRequest({ ...request, minLat: 62, maxLat: 60 }).valid, false);
    assert.strictEqual(validateCompareRequest({ ...request, periodAStart: '2023-01-01', periodAEnd: '2025-01-01' }).valid, false);
    assert.strictEqual(validateCompareRequest({ ...request, periodAStart: '2025-02-30' }).valid, false);
});

test('summarizePeriod and comparePeriods calculate hours, cells, vessels, and breakdowns', () => {
    const reportA = {
        entries: [{
            'public-global-fishing-effort:v3.0': [
                { lat: 57.1, lon: -1.2, hours: 10.5, geartype: 'trawlers', flag: 'GBR' },
                { lat: 57.2, lon: -1.1, hours: 9.5, geartype: 'pots_and_traps', flag: 'GBR' }
            ]
        }]
    };
    const reportB = {
        entries: [{
            'public-global-fishing-effort:v3.0': [
                { lat: 57.1, lon: -1.2, hours: 25, geartype: 'trawlers', flag: 'GBR' },
                { lat: 58, lon: -0.5, hours: 5, geartype: 'drifting_longlines', flag: 'NOR' }
            ]
        }]
    };
    const recordsA = flatten4WingsEntries(reportA);
    const recordsB = flatten4WingsEntries(reportB);
    const summaryA = summarizePeriod(recordsA, [
        { vessel: { ssvid: '235001111' } },
        { vessel: { ssvid: '235002222' } }
    ]);
    const summaryB = summarizePeriod(recordsB, [
        { vessel: { ssvid: '235001111' } },
        { vessel: { ssvid: '235003333' } },
        { vessel: { ssvid: '257009999' } }
    ]);
    const comparison = comparePeriods(summaryA, summaryB);

    assert.strictEqual(summaryA.totalHours, 20);
    assert.strictEqual(summaryB.totalHours, 30);
    assert.strictEqual(summaryA.activeCells, 2);
    assert.strictEqual(comparison.totalHours.diff, 10);
    assert.strictEqual(comparison.totalHours.percentChange, 50);
    assert.strictEqual(comparison.uniqueVessels.diff, 1);
    assert.strictEqual(comparison.gearBreakdown.find(item => item.label === 'trawlers').diff, 14.5);
    assert.strictEqual(comparison.flagBreakdown.find(item => item.label === 'NOR').percentChange, null);
});

test('computeDelta handles zero baselines and negative changes', () => {
    assert.deepStrictEqual(computeDelta(0, 0), { diff: 0, percentChange: 0, direction: 'flat' });
    assert.deepStrictEqual(computeDelta(0, 12.5), { diff: 12.5, percentChange: null, direction: 'up' });
    assert.deepStrictEqual(computeDelta(50, 25), { diff: -25, percentChange: -50, direction: 'down' });
});

console.log(`\nAll ${passed} comparison tests finished.`);
