// Links into Buffer's own web app (publish.buffer.com). Signed-out visitors go through Buffer's
// login first and then land on the page.

export const BUFFER_PUBLISH_URL = "https://publish.buffer.com";

/** Buffer's Home page, the starting point of its web app. */
export const BUFFER_HOME_URL = `${BUFFER_PUBLISH_URL}/home`;

/** Buffer's Ideas board, where ideas saved from a prompt land. */
export const BUFFER_IDEAS_URL = `${BUFFER_PUBLISH_URL}/create/ideas?view=board`;

/** One channel's Queue tab: its scheduled posts, waiting to go out. */
export function bufferQueueUrl(channelId: string): string {
  return `${BUFFER_PUBLISH_URL}/channels/${encodeURIComponent(channelId)}/schedule?tab=queue`;
}

/** One channel's posting schedule in Buffer: the times its posts go out. */
export function bufferPostingScheduleUrl(channelId: string): string {
  return `${BUFFER_PUBLISH_URL}/channels/${encodeURIComponent(channelId)}/settings?tab=posting-schedule`;
}

/** Buffer's account settings, where people change their name and photo. */
export const BUFFER_SETTINGS_URL = `${BUFFER_PUBLISH_URL}/settings`;

/** Buffer's page for connecting social accounts. */
export const BUFFER_CHANNEL_SETTINGS_URL = `${BUFFER_PUBLISH_URL}/settings/channels`;

/** The Drafts tab of one channel, where drafts with and without a time are listed. */
export function bufferDraftsUrl(channelId: string): string {
  return `${BUFFER_PUBLISH_URL}/channels/${encodeURIComponent(channelId)}/schedule?tab=drafts`;
}

/** One channel's page in Buffer, where its queue and its posting schedule settings are. */
export function bufferChannelUrl(channelId: string): string {
  return `${BUFFER_PUBLISH_URL}/channels/${encodeURIComponent(channelId)}/schedule`;
}
