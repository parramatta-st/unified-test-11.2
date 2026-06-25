export default function handler(_req:any,res:any){
  const keys = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_PRIVATE_KEY','GOOGLE_SHEETS_SPREADSHEET_ID',
    'CONTACTS_SHEET_NAME','CURRICULUM_SHEET_NAME','TUTOR_CONFIG_SHEET_NAME','FEEDBACK_LOG_SHEET_NAME','PRINT_LOG_SHEET_NAME','PRINT_SETTINGS_SHEET_NAME',
    'NEXT_PUBLIC_SHEET_REFRESH_MS','NEXT_PUBLIC_CAMPUS_NAME','PRINT_API_URL'
  ];
  const obj:any = {};
  for (const k of keys) obj[k] = process.env[k] ? 'set' : 'missing';
  res.status(200).json(obj);
}
