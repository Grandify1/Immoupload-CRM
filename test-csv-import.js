
const testCSVImport = async () => {
  console.log('🧪 Starting direct CSV import test...');
  
  const testData = {
    userId: "4467ca04-af24-4c9e-b26b-f3152a00f429",
    teamId: "test-team-id", // Du musst deine echte team_id hier einsetzen
    csvData: [
      ["John Doe", "john@example.com", "+49123456789"],
      ["Jane Smith", "jane@example.com", "+49987654321"]
    ],
    mappings: [
      { csvHeader: "Name", fieldName: "name", createCustomField: false },
      { csvHeader: "Email", fieldName: "email", createCustomField: false },
      { csvHeader: "Phone", fieldName: "phone", createCustomField: false }
    ],
    duplicateConfig: {
      duplicateDetectionField: "email",
      duplicateAction: "skip"
    },
    jobId: `test-job-${Date.now()}`,
    isInitialRequest: true
  };

  try {
    const response = await fetch('https://your-project.supabase.co/functions/v1/csv-import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ANON_KEY'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    console.log('📊 Test Result:', result);
    console.log('📊 Response Status:', response.status);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

// Uncomment to run the test:
// testCSVImport();

console.log('Test script loaded. Update the teamId and Supabase URL, then call testCSVImport()');
