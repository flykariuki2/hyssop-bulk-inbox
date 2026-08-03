export type GroupableMessage = {
  phone_number: string;
  created_at: string;
};

export function groupMessagesByPhone<
  T extends GroupableMessage
>(messages: T[]): Record<string, T[]> {
  const groupedMessages: Record<string, T[]> = {};

  for (const message of messages) {
    const phone = message.phone_number.trim();

    if (!phone) continue;

    if (!groupedMessages[phone]) {
      groupedMessages[phone] = [];
    }

    groupedMessages[phone].push(message);
  }

  for (const conversation of Object.values(groupedMessages)) {
    conversation.sort(
      (firstMessage, secondMessage) =>
        new Date(firstMessage.created_at).getTime() -
        new Date(secondMessage.created_at).getTime()
    );
  }

  return groupedMessages;
}