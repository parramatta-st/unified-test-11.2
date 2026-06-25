import crypto from 'crypto';
import { appendSheetRows, loadRowsPrivateFirst, overwriteSheetRows, privateSheetsConfigured, sheetNames, spreadsheetIdFor, upsertSheetRowByKey } from './googleSheets';

export type Member = {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  parentName: string;
  parentEmail: string;
  years: string;
  active: boolean;
};

export const MEMBER_HEADERS = ['id', 'firstName', 'lastName', 'gender', 'parentName', 'parentEmail', 'years', 'active'];

function norm(value: any) { return String(value ?? '').trim(); }
function lower(value: any) { return norm(value).toLowerCase(); }

export function truthyActive(value: any) {
  const s = lower(value);
  if (!s) return true;
  return ['true', 'yes', 'y', '1', 'active', 'enabled'].includes(s);
}

function readValue(row: any, ...keys: string[]) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && norm(row[key]) !== '') return norm(row[key]);
  return '';
}

export function normalizeGender(value: any) {
  const g = lower(value);
  if (['f', 'female', 'girl'].includes(g)) return 'female';
  if (['m', 'male', 'boy'].includes(g)) return 'male';
  return '';
}

export function displayGender(value: any) {
  const g = normalizeGender(value);
  if (g === 'female') return 'Female';
  if (g === 'male') return 'Male';
  return norm(value) || '—';
}

export function generateMemberId() {
  return `mem_${crypto.randomBytes(5).toString('hex')}`;
}

export function normalizeMemberRow(row: any): Member | null {
  const firstName = readValue(row, 'firstName', 'FirstName', 'first', 'First');
  const lastName = readValue(row, 'lastName', 'LastName', 'last', 'Last');
  const fullName = readValue(row, 'Name', 'name', 'student', 'Student', 'studentName', 'StudentName');
  const parts = fullName && !firstName ? fullName.split(/\s+/).filter(Boolean) : [];
  const first = firstName || parts[0] || '';
  const last = lastName || parts.slice(1).join(' ');
  if (!first && !last) return null;
  return {
    id: readValue(row, 'id', 'ID', 'memberId', 'MemberID') || generateMemberId(),
    firstName: first,
    lastName: last,
    gender: normalizeGender(readValue(row, 'gender', 'Gender')),
    parentName: readValue(row, 'parentName', 'ParentName', 'parentFirstName', 'ParentFirstName'),
    parentEmail: readValue(row, 'parentEmail', 'ParentEmail', 'Email', 'email').toLowerCase(),
    years: readValue(row, 'years', 'Years', 'year', 'Year'),
    active: truthyActive(row?.active ?? row?.Active ?? row?.enabled ?? row?.Enabled),
  };
}

export async function loadMembers() {
  const result = await loadRowsPrivateFirst({
    kind: 'CONTACTS',
    sheetName: sheetNames.contacts(),
    csvUrls: [process.env.CONTACTS_CSV_URL || '', process.env.NEXT_PUBLIC_CONTACTS_CSV_URL || ''],
  });
  const members = (result.rows || []).map(normalizeMemberRow).filter(Boolean) as Member[];
  members.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  return { ...result, members };
}

export function memberToSheetRow(member: Member) {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    gender: normalizeGender(member.gender),
    parentName: member.parentName,
    parentEmail: member.parentEmail.toLowerCase(),
    years: member.years,
    active: member.active ? 'TRUE' : 'FALSE',
  };
}

function requirePrivateSheetsForSave() {
  if (!privateSheetsConfigured()) throw new Error('Private Google Sheets is required to save members. Configure the service account first. Viewing from old CSV fallback is read-only.');
}

export async function saveMembers(members: Member[]) {
  requirePrivateSheetsForSave();
  const rows = members.map(memberToSheetRow);
  await overwriteSheetRows(sheetNames.contacts(), MEMBER_HEADERS, rows, spreadsheetIdFor('CONTACTS'));
}

export async function appendMember(member: Member) {
  requirePrivateSheetsForSave();
  await appendSheetRows(sheetNames.contacts(), MEMBER_HEADERS, [memberToSheetRow(member)], spreadsheetIdFor('CONTACTS'));
}

export async function saveMemberRow(member: Member) {
  requirePrivateSheetsForSave();
  await upsertSheetRowByKey({
    sheetName: sheetNames.contacts(),
    headers: MEMBER_HEADERS,
    keyHeader: 'id',
    keyValue: member.id,
    row: memberToSheetRow(member),
    spreadsheetId: spreadsheetIdFor('CONTACTS'),
  });
}

export function cleanMemberInput(input: any, existingId?: string): Member {
  const id = existingId || norm(input?.id) || generateMemberId();
  const firstName = norm(input?.firstName);
  const lastName = norm(input?.lastName);
  const gender = normalizeGender(input?.gender);
  const parentName = norm(input?.parentName || input?.parentFirstName);
  const parentEmail = norm(input?.parentEmail).toLowerCase();
  const years = norm(input?.years || input?.year);
  const active = input?.active === undefined ? true : truthyActive(input.active);
  if (!firstName) throw new Error('Student first name is required');
  if (!lastName) throw new Error('Student last name is required');
  if (!gender) throw new Error('Gender must be male or female. M/F is also accepted on imports.');
  if (!parentName) throw new Error('Parent first name is required');
  if (!parentEmail) throw new Error('Parent email is required');
  if (!years) throw new Error('School year is required');
  return { id, firstName, lastName, gender, parentName, parentEmail, years, active };
}

export function findDuplicateMember(members: Member[], candidate: Member, ignoreId?: string) {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim().toLowerCase();
  const email = candidate.parentEmail.toLowerCase();
  return members.find((member) => {
    if (ignoreId && member.id === ignoreId) return false;
    const memberName = `${member.firstName} ${member.lastName}`.trim().toLowerCase();
    return memberName === name && member.parentEmail.toLowerCase() === email;
  });
}
