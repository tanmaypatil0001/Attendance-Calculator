document.addEventListener('DOMContentLoaded', async () => {
    // Get all UI elements
    const summaryView = document.getElementById('summaryView');
    const predictorView = document.getElementById('predictorView');
    const wrongPageView = document.getElementById('wrongPageView');
    const loadingView = document.getElementById('loadingView');

    const analyzeSummaryBtn = document.getElementById('analyzeSummaryBtn');
    const calculateFutureBtn = document.getElementById('calculateFutureBtn');

    const resultsDiv = document.getElementById('results');
    const predictorResultsDiv = document.getElementById('predictorResults');
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // --- Main Logic: Detect page and show correct UI ---
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content_script.js'],
        });

        loadingView.classList.add('hidden'); // Hide loading spinner

        if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) {
            throw new Error("Script injection failed or returned no result.");
        }

        const pageInfo = injectionResults[0].result;

        if (pageInfo.type === 'summaryPage') {
            summaryView.classList.remove('hidden');
             if (pageInfo.data && pageInfo.data.length > 0) {
                displaySummaryResults(pageInfo.data);
                // The button in summary view doesn't need an action, as the data is pre-loaded.
                // We just provide visual feedback.
                analyzeSummaryBtn.onclick = () => {
                    analyzeSummaryBtn.textContent = 'Analyzed!';
                    analyzeSummaryBtn.style.backgroundColor = '#16a34a';
                };
            } else {
                 resultsDiv.innerHTML = `<div class="error-container">Could not find attendance data on this page.</div>`;
            }
        } else if (pageInfo.type === 'itineraryPage') {
            predictorView.classList.remove('hidden');
            const today = new Date();
            const future = new Date();
            future.setDate(today.getDate() + 30);
            startDateInput.value = today.toISOString().split('T')[0];
            endDateInput.value = future.toISOString().split('T')[0];
        } else { // unknownPage
            wrongPageView.classList.remove('hidden');
        }

    } catch (e) {
        console.error("Attendance Tracker Error:", e);
        loadingView.classList.add('hidden');
        wrongPageView.classList.remove('hidden');
    }

    // --- Event Listeners ---
    calculateFutureBtn.addEventListener('click', async () => {
        predictorResultsDiv.innerHTML = `<div class="loading">Calculating...</div>`;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            predictorResultsDiv.innerHTML = `<div class="error-container">Please select a valid start and end date.</div>`;
            return;
        }
        
        try {
            const itineraryResponse = await chrome.tabs.sendMessage(tab.id, { 
                action: "calculateFromItinerary", 
                startDate, 
                endDate 
            });

            if (itineraryResponse && itineraryResponse.results) {
                displayPredictionResults(itineraryResponse.results);
            } else {
                predictorResultsDiv.innerHTML = `<div class="error-container">Could not find a schedule on this page.</div>`;
            }

        } catch (e) {
             predictorResultsDiv.innerHTML = `<div class="error-container">Could not run calculation. Is the page fully loaded? Please refresh and try again.</div>`;
        }
    });

    // --- Helper Functions ---
    function displaySummaryResults(data) {
        resultsDiv.innerHTML = ''; // Clear previous results
        if (data.length === 0) {
            resultsDiv.innerHTML = `<div class="error-container">No summary data found.</div>`;
            return;
        }

        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Attended</th>
                        <th>Total</th>
                        <th>%</th>
                        <th>Can Skip</th>
                        <th>Needed</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(sub => {
            const percentage = parseFloat(sub.attendance);
            tableHTML += `
                <tr>
                    <td title="${sub.subjectName}">${sub.subjectName}</td>
                    <td>${sub.attended}</td>
                    <td>${sub.total}</td>
                    <td class="${percentage >= 75 ? 'percentage-good' : 'percentage-bad'}">${sub.attendance}%</td>
                    <td style="color: #166534; font-weight: bold;">${sub.canSkip}</td>
                    <td style="color: #991b1b; font-weight: bold;">${sub.needed}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        resultsDiv.innerHTML = tableHTML;
    }

    function displayPredictionResults(predictions) {
        predictorResultsDiv.innerHTML = ''; // Clear previous results
        if (Object.keys(predictions).length === 0) {
            predictorResultsDiv.innerHTML = `<div class="error-container">No lectures found in the selected date range.</div>`;
            return;
        }

        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Attended</th>
                        <th>Total</th>
                        <th>%</th>
                        <th>Can Skip</th>
                        <th>Needed</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const subjectName in predictions) {
            const pred = predictions[subjectName];
            const percentage = parseFloat(pred.percentage);
            tableHTML += `
                <tr>
                    <td title="${subjectName}">${subjectName}</td>
                    <td>${pred.attended}</td>
                    <td>${pred.total}</td>
                    <td class="${percentage >= 75 ? 'percentage-good' : 'percentage-bad'}">${percentage.toFixed(1)}%</td>
                    <td style="color: #166534; font-weight: bold;">${pred.canSkip}</td>
                    <td style="color: #991b1b; font-weight: bold;">${pred.needed}</td>
                </tr>
            `;
        }

        tableHTML += `</tbody></table>`;
        predictorResultsDiv.innerHTML = tableHTML;
    }
});

