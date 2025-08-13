import { sendMeetingNotification } from './gmail.service'; // 既存
export async function notifyMember(memberId: string, subject: string, text: string) {
  return sendMeetingNotification(memberId, subject, text);
}
