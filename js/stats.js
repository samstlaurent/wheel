import { getWinnerStats } from './firebase.js';

let statsChart = null;
let currentChartType = 'bar';
let cachedSpinData = null;

export function initStatsModule(names, nameColorMap) {
    const statsModal = document.getElementById("statsModal");
    const statsButton = document.getElementById("statsButton");

    statsButton.onclick = () => {
        logWinnerFrequencyFromFirestore(names, nameColorMap, 1000, true);
        statsModal.style.display = "flex";
    };

    document.getElementById("barChartBtn").onclick = function() {
        currentChartType = 'bar';
        setChartTypeButtons('bar');
        logWinnerFrequencyFromFirestore(names, nameColorMap, 1000);
    };

    document.getElementById("pieChartBtn").onclick = function() {
        currentChartType = 'pie';
        setChartTypeButtons('pie');
        logWinnerFrequencyFromFirestore(names, nameColorMap, 1000);
    };

    statsModal.onclick = (e) => {
        if (e.target === e.currentTarget) {
            statsModal.style.display = "none";
        }
    };
}

function setChartTypeButtons(activeType) {
    document.getElementById("barChartBtn").style.background =
        activeType === 'bar' ? '#4ba3f2' : '#999';
    document.getElementById("pieChartBtn").style.background =
        activeType === 'pie' ? '#4ba3f2' : '#999';
}

const EXCLUDED_COLOR = '#e0e0e0';

async function logWinnerFrequencyFromFirestore(names, nameColorMap, limitCount = 1000, bustCache = false) {
    try {
        if (!cachedSpinData || bustCache) {
            const snapshot = await getWinnerStats(limitCount);
            if (!snapshot) return;

            cachedSpinData = [];
            snapshot.forEach(doc => cachedSpinData.push(doc.data()));
        }

        const counts = {};
        const expected = {};

        // Seed with current names, then add any historical names seen in data
        const allNames = new Set(names);
        cachedSpinData.forEach(data => {
            if (data.winner) allNames.add(data.winner);
            (data.activeNames || []).forEach(n => allNames.add(n));
        });

        allNames.forEach(name => {
            counts[name] = 0;
            expected[name] = 0;
        });

        cachedSpinData.forEach(data => {
            const winner = data.winner;
            const active = data.activeNames || [];
            const selected = data.userName;

            if (winner) counts[winner]++;

            if (active.length === 0) return;

            const totalWeight = active.length - 0.5;
            active.forEach(name => {
                const weight = name === selected ? 0.5 : 1;
                expected[name] += weight / totalWeight;
            });
        });

        const labels = [...allNames];
        const data = labels.map(name => counts[name] || 0);
        const expectedData = labels.map(name => expected[name] || 0);

        const colors = labels.map(name => nameColorMap[name] || EXCLUDED_COLOR);

        const ctx = document.getElementById("statsChart").getContext("2d");

        if (statsChart) {
            statsChart.destroy();
        }

        let datasets;

        if (currentChartType === 'bar') {
            datasets = [
                {
                    label: 'Expected Wins',
                    data: expectedData,
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    grouped: false,
                    type: 'bar',
                    barPercentage: 0.4,
                    categoryPercentage: 1.0
                },
                {
                    label: 'Actual Wins',
                    data: data,
                    backgroundColor: colors
                }
            ];
        } else {
            datasets = [
                {
                    label: 'Wins',
                    data: data,
                    backgroundColor: colors
                }
            ];
        }

        const chartConfig = {
            type: currentChartType,
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 300,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: currentChartType === 'pie' ? 'right' : 'top',
                        labels: {
                            filter: function(item) {
                                if (currentChartType === 'bar') {
                                    return item.text === 'Expected Wins';
                                }
                                return true;
                            }
                        }
                    },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                if (currentChartType !== 'bar') {
                                    return context.label + ': ' + context.parsed;
                                }

                                const index = context.dataIndex;
                                const chartDatasets = context.chart.data.datasets;

                                const actual = chartDatasets[1].data[index];
                                const exp = chartDatasets[0].data[index];

                                const diff = actual - exp;
                                const diffText = diff >= 0
                                    ? `+${diff.toFixed(2)}`
                                    : diff.toFixed(2);

                                return [
                                    `Actual: ${actual}`,
                                    `Expected: ${exp.toFixed(2)}`,
                                    `Diff: ${diffText}`
                                ];
                            }
                        }
                    }
                }
            }
        };

        if (currentChartType === 'bar') {
            chartConfig.options.scales = {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            };
        }

        statsChart = new Chart(ctx, chartConfig);

    } catch (err) {
        console.error("Failed to fetch winner stats:", err);
    }
}