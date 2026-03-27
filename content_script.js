// This script uses an IIFE to prevent errors if it's injected multiple times.
(() => {
    // If the functions already exist, just return the page type.
    if (typeof window.attendanceTrackerFunctions !== 'undefined') {
        const pageText = document.body.innerText.toLowerCase(); // Use lowercase for robust matching
        if (pageText.includes("overall theory attendance")) {
            return { type: 'summaryPage', data: window.attendanceTrackerFunctions.scrapeSummary() };
        } else if (pageText.includes("report from")) {
            return { type: 'itineraryPage' };
        } else {
            return { type: 'unknownPage' };
        }
    }

    // Define the functions for the first time.
    window.attendanceTrackerFunctions = {
        scrapeSummary: () => {
            const allTables = document.querySelectorAll('table');
            const attendanceData = [];
            allTables.forEach(table => {
                const headers = [...table.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
                const isTheoryTable = headers.includes('subject') && headers.includes('total lectures conducted');
                const isPracticalTable = headers.includes('subject') && headers.includes("total practical's conducted");
                if (isTheoryTable || isPracticalTable) {
                    table.querySelectorAll('tr').forEach(row => {
                        if (row.querySelector('th')) return; // Skip header rows
                        const cells = row.querySelectorAll('td');
                        if (cells.length < 4) return;
                        const subjectName = cells[0].innerText.trim();
                        if (!subjectName || subjectName.toLowerCase() === 'total') return;
                        const total = parseInt(cells[1].innerText.trim(), 10);
                        const attended = parseInt(cells[2].innerText.trim(), 10);
                        const attendance = cells[3].innerText.trim();
                        if (!isNaN(total) && !isNaN(attended) && total > 0) {
                            let canSkip = 0;
                            let needed = 0;
                            const currentPercentage = attended / total;

                            if (currentPercentage >= 0.75) {
                                const requiredFor75 = Math.ceil(0.75 * total);
                                canSkip = attended - requiredFor75;
                                needed = 0;
                            } else {
                                canSkip = 0;
                                // Predictive formula: How many future lectures must be attended to reach 75%
                                needed = Math.ceil(3 * total - 4 * attended);
                            }

                            const finalSubjectName = isPracticalTable ? `${subjectName} (Practical)` : subjectName;
                            attendanceData.push({ subjectName: finalSubjectName, total, attended, attendance, canSkip, needed });
                        }
                    });
                }
            });
            return attendanceData;
        },

        calculateFromItinerary: (startDateStr, endDateStr) => {
            const subjectData = {};
            let table = null;
            document.querySelectorAll('table').forEach(t => {
                const headers = [...t.querySelectorAll('th')].map(th => th.innerText.trim().toLowerCase());
                if (headers.includes("date") && headers.includes("slot 1")) {
                    table = t;
                }
            });
            if (!table) return null;

            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            table.querySelectorAll('tr').forEach(row => {
                if (row.querySelector('th')) return;
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                const dateCellText = cells[0].innerText.trim();
                const parts = dateCellText.split('-');
                if (parts.length < 2) return;
                const day = parts[0];
                const monthStr = parts[1].split(' ')[0];
                const currentYear = new Date().getFullYear();
                const rowDate = new Date(`${day} ${monthStr} ${currentYear}`);

                if (rowDate >= startDate && rowDate <= endDate) {
                    for (let i = 1; i < cells.length; i++) {
                        const cell = cells[i];
                        const cellText = cell.innerText.trim();
                        if (cellText && cellText !== '::') {
                            // Use the full text (e.g., "Rashmi:CSS:.T") as the unique key.
                            // This correctly separates Theory (.T) from Practicals (.P1).
                            const subjectName = cellText;

                            if (!subjectData[subjectName]) {
                                subjectData[subjectName] = { total: 0, attended: 0 };
                            }
                            subjectData[subjectName].total += 1;
                            const style = cell.getAttribute('style');
                            // Check for red background color to mark as missed
                            if (!style || !style.toLowerCase().includes('background-color')) {
                                subjectData[subjectName].attended += 1;
                            }
                        }
                    }
                }
            });

            // Calculate percentage, skippable lectures, and needed lectures for each subject.
            for (const subjectName in subjectData) {
                const data = subjectData[subjectName];
                data.percentage = data.total > 0 ? (data.attended / data.total) * 100 : 0;
                
                const currentPercentage = data.total > 0 ? data.attended / data.total : 0;

                if (currentPercentage >= 0.75) {
                    const requiredFor75 = Math.ceil(0.75 * data.total);
                    data.canSkip = data.attended - requiredFor75;
                    data.needed = 0;
                } else {
                    data.canSkip = 0;
                    // Predictive formula: How many future lectures must be attended to reach 75%
                    data.needed = Math.ceil(3 * data.total - 4 * data.attended);
                }
            }

            return subjectData;
        }
    };

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "calculateFromItinerary") {
            const results = window.attendanceTrackerFunctions.calculateFromItinerary(request.startDate, request.endDate);
            sendResponse({ results });
        }
        return true; // Indicates an asynchronous response.
    });

    // Initial script execution returns the page type to the popup.
    const pageText = document.body.innerText.toLowerCase(); // Use lowercase for robust matching
    if (pageText.includes("overall theory attendance")) {
        return { type: 'summaryPage', data: window.attendanceTrackerFunctions.scrapeSummary() };
    } else if (pageText.includes("report from")) {
        return { type: 'itineraryPage' };
    } else {
        return { type: 'unknownPage' };
    }
})();

