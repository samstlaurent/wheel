import { getWinnerStats } from './firebase.js';

let statsChart = null;
let currentChartType = 'bar';

export function initStatsModule(names, nameColorMap, colorMode, baseHue) {
    const statsModal = document.getElementById("statsModal");
    const statsButton = document.getElementById("statsButton");

    statsButton.onclick = () => {
        logWinnerFrequencyFromFirestore(names, nameColorMap, 1000);
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
async function logWinnerFrequencyFromFirestore(names, nameColorMap, limitCount = 1000) {
    try {
        const snapshot = await getWinnerStats(limitCount);
        if (!snapshot) return;

        const counts = {};
        const expected = {};

        names.forEach(name => {
            counts[name] = 0;
            expected[name] = 0;
        });

        snapshot.forEach(doc => {
            const data = doc.data();

            const winner = data.winner;
            const active = data.activeNames || [];
            const selected = data.userName;

            if (winner) {
                if (!(winner in counts)) counts[winner] = 0;
                counts[winner]++;
            }

            if (active.length === 0) return;

            const totalWeight = active.length - 0.5;

            active.forEach(name => {
                if (!(name in expected)) expected[name] = 0;

                const weight = (name === selected) ? 0.5 : 1;
                const probability = weight / totalWeight;

                expected[name] += probability;
            });
        });

        const labels = [...names];
        const data = labels.map(name => counts[name] || 0);
        const expectedData = labels.map(name => expected[name] || 0);

        const colors = labels.map((name) => {
            if (nameColorMap && nameColorMap[name]) {
                return nameColorMap[name];
            }

            return EXCLUDED_COLOR;
        });

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
                                    // Default pie chart tooltip
                                    return context.label + ': ' + context.parsed;
                                }

                                const index = context.dataIndex;
                                const datasets = context.chart.data.datasets;

                                const actual = datasets[1].data[index];
                                const expected = datasets[0].data[index];

                                const diff = actual - expected;
                                const diffText = diff >= 0
                                    ? `+${diff.toFixed(2)}`
                                    : diff.toFixed(2);

                                return [
                                    `Actual: ${actual}`,
                                    `Expected: ${expected.toFixed(2)}`,
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
        } else {
            // Don't show expected dataset on pie chart
            chartConfig.data.datasets = chartConfig.data.datasets.slice(0, 1);
        }

        statsChart = new Chart(ctx, chartConfig);

    } catch (err) {
        console.error("Failed to fetch winner stats:", err);
    }
}
