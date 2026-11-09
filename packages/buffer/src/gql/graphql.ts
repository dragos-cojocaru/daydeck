/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** An annotation in text input. */
export type AnnotationInput = {
  /** The text content in the annotation span. */
  content: string;
  /** The display value, when present. */
  displayValue?: string | null | undefined;
  /** The start and exclusive end offsets in the text. */
  indices: Array<number>;
  /** The service entity ID, when present. */
  serviceEntityId?: string | null | undefined;
  /** The text representation of the annotation. */
  text: string;
  /** The annotation type. */
  type: AnnotationType;
  /** The annotation URL, when present. */
  url?: string | null | undefined;
};

/** Annotation representing all the entities in the text */
export type AnnotationInputFacebook = {
  /** The content of the annotation, e.g. '107509875938399' */
  content: string;
  /** The indices of the annotation in the text, e.g. [6, 9] (from 6 to 9 characters in the text) */
  indices: Array<number>;
  /** The text representation of the annotation, eg 'Buffer' */
  text: string;
  /** The URL the annotation points to, e.g. https://www.facebook.com/107509875938399 */
  url: string;
};

/** Annotation representing all the entities in the text */
export type AnnotationInputLinkedIn = {
  /** The entity of the annotation, e.g. urn:li:organization:1521226 */
  entity: string;
  /** The id of the annotation, e.g. 1521226 */
  id: string;
  /** The length of the annotation, e.g. 6 */
  length: number;
  /** The link of the annotation, e.g. https://www.linkedin.com/company/bufferapp */
  link: string;
  /** The localized name of the annotation, e.g. Buffer */
  localizedName: string;
  /** The start of the annotation, e.g. 5 */
  start: number;
  /** The vanity name of the annotation, e.g. bufferapp */
  vanityName: string;
};

/** List of possible types for an annotation */
export type AnnotationType =
  | 'annotation'
  | 'bold'
  | 'bulletedListItem'
  | 'cashtag'
  | 'hashtag'
  | 'heading'
  | 'italic'
  | 'mention'
  | 'orderedListItem'
  | 'strikethrough'
  | 'url';

/** A single entity's asset. Exactly one variant must be provided. */
export type AssetInput = {
  /** Document asset */
  document?: DocumentAssetInput | null | undefined;
  /** Image asset */
  image?: ImageAssetInput | null | undefined;
  /**
   * Use metadata.{service}.linkAttachment instead. This field will be removed on December 15, 2026.
   * @deprecated Use metadata.{service}.linkAttachment instead. This field will be removed on December 15, 2026.
   */
  link?: LinkAssetInput | null | undefined;
  /** Video asset */
  video?: VideoAssetInput | null | undefined;
};

/** Bluesky post metadata */
export type BlueskyPostMetadataInput = {
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
  /**
   * The ordered list of posts that make up the thread (not paginated). This
   * array is the source of truth for what gets published: every post in the
   * thread, including the root post, must be provided here. Posts are
   * published in order, each replying to the previous one. The first item is
   * the root post and should match the top-level `text` on the post input.
   */
  thread?: Array<ThreadedPostInput> | null | undefined;
};

/** The entity whose Notes thread to use. Set exactly one field. */
export type CollaborationNoteSubjectInput = {
  /**
   * The ContentItem ID. Selects the ContentItem's own thread, not the threads of
   * its Posts.
   */
  contentItemId?: string | null | undefined;
  /** The Post ID. */
  postId?: string | null | undefined;
};

/** The content for a new collaboration Note. */
export type CreateCollaborationNoteInput = {
  /** The annotations for the Note. Omit or pass null to use an empty list. */
  annotations?: Array<AnnotationInput> | null | undefined;
  /** The entity whose Notes thread gets the Note. */
  subject: CollaborationNoteSubjectInput;
  /** The Note text. */
  text: string;
};

/** createIdea input type */
export type CreateIdeaInput = {
  /** Content and metadata for the new idea */
  content: IdeaContentInput;
  /** Call-to-action identifier for analytics tracking */
  cta?: string | null | undefined;
  /** Group placement (null for unassigned group) */
  group?: IdeaGroupInput | null | undefined;
  /** Organization ID that will own the idea */
  organizationId: string | number;
  /** Template ID used to create the idea */
  templateId?: string | null | undefined;
};

/**
 * Create post's request input.
 *
 * Note: `metadata.{service}.linkAttachment` is mutually exclusive with a non-empty `assets`
 * array. Input providing both is rejected.
 */
export type CreatePostInput = {
  /** If this post was created with the help of AI */
  aiAssisted?: boolean | null | undefined;
  /** Ordered list of assets on this post. */
  assets?: Array<AssetInput>;
  /** Channel's Id for which we want to create the post */
  channelId: string;
  /** Is set when the Post is generated from a Draft */
  draftId?: string | null | undefined;
  /** Date when the post is scheduled to be published */
  dueAt?: string | null | undefined;
  /** Is set when the Post is generated from an Idea */
  ideaId?: string | null | undefined;
  /** Metadata of the post which differs based on the social network/service */
  metadata?: PostInputMetaData | null | undefined;
  /** How the post is being scheduled. */
  mode: ShareMode;
  /**
   * Submit the post for approval instead of scheduling it. A post submitted for
   * approval is always a draft, so this conflicts with turning `saveToDraft` off.
   *
   * Only valid when your posting policy on the target channel requires approval.
   */
  needsApproval?: boolean;
  /**
   * If true, saves the post as a draft instead of scheduling it.
   * When saving as draft:
   * - Post status will be 'draft' instead of 'buffer'
   * - Posting limits are not checked
   * - The post will not be published until explicitly scheduled
   */
  saveToDraft?: boolean | null | undefined;
  /** Scheduling type to indicate notification publishing or automatic publishing */
  schedulingType: SchedulingType;
  /** source where the composer was initiated from, used for tracking. */
  source?: string | null | undefined;
  /** List of tag IDs */
  tagIds?: Array<string> | null | undefined;
  /**
   * Text content of the Post.
   *
   * Note: for threaded posts, this needs to match the first item in the `thread` array.
   */
  text?: string | null | undefined;
};

/** Input for creating a tag. */
export type CreateTagInput = {
  /**
   * Organization to create the tag in. The caller must be an administrator of
   * this organization.
   */
  organizationId: string;
  /** The name and color to give the new tag. */
  tag: TagToCreateInput;
};

/** Day of the week. */
export type DayOfWeek =
  | 'fri'
  | 'mon'
  | 'sat'
  | 'sun'
  | 'thu'
  | 'tue'
  | 'wed';

/** Document asset */
export type DocumentAssetInput = {
  /** Document thumbnail URL */
  thumbnailUrl: string;
  /** Document title */
  title: string;
  /** Document URL */
  url: string;
};

/**
 * Edit post's request input.
 *
 * Note: `metadata.{service}.linkAttachment` is mutually exclusive with a non-empty `assets`
 * array. Input providing both is rejected.
 */
export type EditPostInput = {
  /** If this post was edited with the help of AI */
  aiAssisted?: boolean | null | undefined;
  /**
   * Change the post's approval state alongside this edit. Leave unset to keep the
   * post's current approval state.
   *
   * Only valid when your posting policy on the post's channel requires approval,
   * and only on your own drafts. Asking for the state the post is already in does
   * nothing.
   */
  approvalChange?: PostApprovalChange | null | undefined;
  /**
   * Ordered list of assets on this post. Omit to preserve the existing list,
   * pass an empty array to clear it
   */
  assets?: Array<AssetInput> | null | undefined;
  /** Is set when the Post is generated from a Draft */
  draftId?: string | null | undefined;
  /** Date when the post is scheduled to be published */
  dueAt?: string | null | undefined;
  /** ID of the post to edit */
  id: string;
  /** Is set when the Post is generated from an Idea */
  ideaId?: string | null | undefined;
  /** Metadata of the post which differs based on the social network/service */
  metadata?: PostInputMetaData | null | undefined;
  /**
   * How the post is being scheduled. Omit the field or pass null to make no
   * scheduling change — null does not clear or reset the schedule: a scheduled post
   * keeps its current share mode, queue slot, and any custom time, and the edit
   * applies only the other provided fields. Pass a non-null ShareMode to apply that
   * mode.
   */
  mode?: ShareMode | null | undefined;
  /**
   * If true, saves the post as a draft instead of keeping it scheduled.
   * When saving as draft:
   * - Post status will be 'draft' instead of 'buffer'
   * - The post will not be published until explicitly scheduled
   */
  saveToDraft?: boolean | null | undefined;
  /**
   * Scheduling type to indicate notification publishing or automatic publishing.
   *
   * Omit it, or send null, to leave the post publishing the way it already does.
   */
  schedulingType?: SchedulingType | null | undefined;
  /** source where the composer was initiated from, used for tracking. */
  source?: string | null | undefined;
  /** tags */
  tagIds?: Array<string> | null | undefined;
  /**
   * Text content of the Post. Omit the field to keep the current text; pass an
   * empty string or null to clear it.
   *
   * Note: for threaded posts, this needs to match the first item in the `thread` array.
   */
  text?: string | null | undefined;
};

/** Facebook post metadata */
export type FacebookPostMetadataInput = {
  /** Annotations representing entities in the text */
  annotations?: Array<AnnotationInputFacebook> | null | undefined;
  /** Facebook post's first comment */
  firstComment?: string | null | undefined;
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
  /** The channel-specific type of the post, eg, post, story, reel for Facebook */
  type: PostTypeFacebook;
};

/** Metadata for a GBP post that is an event */
export type GoogleBusinessEventMetaDataInput = {
  /** Action button. Optional: a post with no button, or `none`, publishes without a call-to-action. On edit, omitting it preserves the existing value. */
  button?: GoogleBusinessPostActionType | null | undefined;
  /** End date of the event. Required on create; optional on edit (omitted preserves existing value). */
  endDate?: string | null | undefined;
  /** Indicate whether the event has a start or end time. */
  isFullDayEvent: boolean;
  /** Link to the action */
  link?: string | null | undefined;
  /** Start date of the event. Required on create; optional on edit (omitted preserves existing value). */
  startDate?: string | null | undefined;
  /** Title of the event. Required on create; optional on edit (omitted preserves existing value). */
  title?: string | null | undefined;
};

/** Metadata for a GBP post that is an offer */
export type GoogleBusinessOfferMetaDataInput = {
  /** Coupon code for the offer */
  code?: string | null | undefined;
  /** End date of the offer. Required on create; optional on edit (omitted preserves existing value). */
  endDate?: string | null | undefined;
  /** Link to the offer */
  link?: string | null | undefined;
  /** Start date of the offer. Required on create; optional on edit (omitted preserves existing value). */
  startDate?: string | null | undefined;
  /** Terms and Conditions */
  terms?: string | null | undefined;
  /** Title of the offer. Required on create; optional on edit (omitted preserves existing value). */
  title?: string | null | undefined;
};

/** List of possible types for GBP cta */
export type GoogleBusinessPostActionType =
  | 'book'
  | 'call'
  | 'learn_more'
  | 'none'
  | 'order'
  | 'shop'
  | 'signup';

/**
 * Google Business Profile post metadata
 * @deprecated: pending proposal for specific GBP post types: update, offer and event metadata types
 */
export type GoogleBusinessPostMetadataInput = {
  /** Details of the Event metadata */
  detailsEvent?: GoogleBusinessEventMetaDataInput | null | undefined;
  /** Details of the Offer metadata */
  detailsOffer?: GoogleBusinessOfferMetaDataInput | null | undefined;
  /** Details of the Whats new metadata */
  detailsWhatsNew?: GoogleBusinessWhatsNewMetaDataInput | null | undefined;
  /** Title if available in the given GBP post type: event and offer */
  title?: string | null | undefined;
  /** The channel-specific type of the post, eg, post, offer, event for Google Business Profile */
  type: PostTypeGoogleBusiness;
};

/** Metadata for a GBP post of type Whats new */
export type GoogleBusinessWhatsNewMetaDataInput = {
  /** Action button. Optional: a post with no button, or `none`, publishes without a call-to-action. On edit, omitting it preserves the existing value. */
  button?: GoogleBusinessPostActionType | null | undefined;
  /** Link to the action */
  link?: string | null | undefined;
};

/** content input for creating/updating an idea */
export type IdeaContentInput = {
  /** Whether AI tools were used in creation */
  aiAssisted?: boolean | null | undefined;
  /** Target date for the idea, often used for planning publish schedules */
  date?: string | null | undefined;
  /** List of media items to attach */
  media?: Array<IdeaMediaInput> | null | undefined;
  /** Services associated with the idea for targeting specific platforms */
  services?: Array<Service> | null | undefined;
  /** Tags to categorize the idea */
  tags?: Array<TagInput> | null | undefined;
  /** Main body text or description */
  text?: string | null | undefined;
  /** Title or headline of the idea */
  title?: string | null | undefined;
};

/** idea group input for create/update */
export type IdeaGroupInput = {
  /** Target group ID (null for unassigned group) */
  groupId?: string | number | null | undefined;
  /** ID of idea to place after (null for top position) */
  placeAfterId?: string | number | null | undefined;
};

export type IdeaMediaInput = {
  /** Alternative text for the media */
  alt?: string | null | undefined;
  /** The size of the media in bytes */
  size?: number | null | undefined;
  /** Source information for the media */
  source?: IdeaMediaSourceInput | null | undefined;
  /** Thumbnail URL for the media */
  thumbnailUrl?: string | null | undefined;
  /** The type of media (image, gif, video, link, document, unsupported). Note: 'video' is not supported via public API */
  type: MediaType;
  /** The URL of the media */
  url: string;
};

/** Input type for the source information of media attached to an idea */
export type IdeaMediaSourceInput = {
  /** for unsplash only */
  author?: string | null | undefined;
  authorUrl?: string | null | undefined;
  id?: string | null | undefined;
  name: string;
  trigger?: string | null | undefined;
};

/** Image asset */
export type ImageAssetInput = {
  /** Image specific metadata */
  metadata?: ImageMetadataInput | null | undefined;
  /** URL to the static thumbnail of the asset */
  thumbnailUrl?: string | null | undefined;
  /** URL to the file source */
  url: string;
};

/** Image dimensions */
export type ImageDimensionsInput = {
  /** Image height in pixels */
  height: number;
  /** Image width in pixels */
  width: number;
};

/** Image metadata */
export type ImageMetadataInput = {
  /** Alternative text for accessibility */
  altText: string;
  /** Animated thumbnail URL */
  animatedThumbnail?: string | null | undefined;
  /**
   * Ignored — the API resolves image dimensions itself.
   * @deprecated Ignored — the API resolves image dimensions itself.
   */
  dimensions?: ImageDimensionsInput | null | undefined;
  /** Accounts to tag at specific points on the image. Each tag's x/y position uses normalized 0.0-1.0 coordinates - see UserTagInput. */
  userTags?: Array<UserTagInput> | null | undefined;
};

/** Instagram Geolocation */
export type InstagramGeolocationInput = {
  /** The id of this location */
  id?: string | null | undefined;
  /** The name of this location */
  text?: string | null | undefined;
};

/** Instagram post metadata */
export type InstagramPostMetadataInput = {
  /** Instagram post's first comment */
  firstComment?: string | null | undefined;
  /** Geolocation of the post */
  geolocation?: InstagramGeolocationInput | null | undefined;
  /** Whether the post discloses AI-generated content */
  isAiGenerated?: boolean | null | undefined;
  /** Shop Grid link for the post */
  link?: string | null | undefined;
  /** Indicates whether post should be shared to feed */
  shouldShareToFeed: boolean;
  /** Sticker fields for reminder-based publishing */
  stickerFields?: InstagramStickerFieldsInput | null | undefined;
  /** The channel-specific type of the post, eg, post, story, reel for Instagram */
  type: PostType;
};

/**
 * Instagram fields for reminder-based publishing. Upon the reminder for publishing, the user
 * is prompted to copy and paste these fields into the Instagram app to complete the post.
 */
export type InstagramStickerFieldsInput = {
  /** Placeholder text for the post's music */
  music?: string | null | undefined;
  /** Additional field for any other post content */
  other?: string | null | undefined;
  /** Placeholder text for the post's linked products */
  products?: string | null | undefined;
  /** Text for the Story or Reel */
  text?: string | null | undefined;
  /** Placeholder text for the post's topics (Reels only) */
  topics?: string | null | undefined;
};

/** Link attached to the post */
export type LinkAssetInput = {
  /** Description of the link */
  description?: string | null | undefined;
  /** Thumbnail URL of the link */
  thumbnailUrl?: string | null | undefined;
  /** Title of the link */
  title?: string | null | undefined;
  /** URL to the link */
  url: string;
};

/** Link attachment */
export type LinkAttachmentInput = {
  /** Description shown on the link card */
  description?: string | null | undefined;
  /** Thumbnail shown on the link card */
  thumbnail?: LinkAttachmentThumbnailInput | null | undefined;
  /** Title shown on the link card */
  title?: string | null | undefined;
  /** URL that the link asset has been built from */
  url: string;
};

/** Thumbnail of a link attachment */
export type LinkAttachmentThumbnailInput = {
  /** URL of the thumbnail image */
  url: string;
};

/** LinkedIn post metadata */
export type LinkedInPostMetadataInput = {
  /** Annotations representing entities in the text */
  annotations?: Array<AnnotationInputLinkedIn> | null | undefined;
  /** LinkedIn post's first comment */
  firstComment?: string | null | undefined;
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
};

/** Mastodon post metadata */
export type MastodonPostMetadataInput = {
  /** Spoiler text hiding the root text of this post */
  spoilerText?: string | null | undefined;
  /**
   * The ordered list of posts that make up the thread (not paginated). This
   * array is the source of truth for what gets published: every post in the
   * thread, including the root post, must be provided here. Posts are
   * published in order, each replying to the previous one. The first item is
   * the root post and should match the top-level `text` on the post input.
   */
  thread?: Array<ThreadedPostInput> | null | undefined;
};

/** The type of media attached to a post */
export type MediaType =
  | 'document'
  | 'gif'
  | 'image'
  | 'link'
  | 'unsupported'
  | 'video';

/** Pinterest post metadata */
export type PinterestPostMetadataInput = {
  /**
   * The board ID of the Pin, can be obtained when fetching the channel details with the following query:
   * ```
   * query GetChannelWithSubprofiles {
   *   channel(input: { id: "[CHANNEL_ID_HERE]" }) {
   *     metadata {
   *       ... on PinterestMetadata {
   *         boards {
   *           serviceId
   *         }
   *       }
   *     }
   *   }
   * }
   * ```
   * Required on create; optional on edit (omitted preserves existing board).
   */
  boardServiceId?: string | null | undefined;
  /** The title of the Pin */
  title?: string | null | undefined;
  /** The Pin destination link */
  url?: string | null | undefined;
};

/** A change to a post's approval state, for a post that is already a draft. */
export type PostApprovalChange =
  /** Submit the draft for approval. */
  | 'request'
  /** Withdraw a pending approval request, returning the post to a plain draft. */
  | 'revert';

/** Metadata of the post which differs based on the social network/service */
export type PostInputMetaData = {
  /** Metadata for Bluesky post */
  bluesky?: BlueskyPostMetadataInput | null | undefined;
  /** Metadata for Facebook post */
  facebook?: FacebookPostMetadataInput | null | undefined;
  /** Metadata for Google Business Profile post */
  google?: GoogleBusinessPostMetadataInput | null | undefined;
  /** Metadata for Instagram post */
  instagram?: InstagramPostMetadataInput | null | undefined;
  /** Metadata for LinkedIn post */
  linkedin?: LinkedInPostMetadataInput | null | undefined;
  /** Metadata for Mastodon post */
  mastodon?: MastodonPostMetadataInput | null | undefined;
  /** Metadata for Pinterest post */
  pinterest?: PinterestPostMetadataInput | null | undefined;
  /** Metadata for Substack post */
  substack?: SubstackPostMetadataInput | null | undefined;
  /** Metadata for Threads post */
  threads?: ThreadsPostMetadataInput | null | undefined;
  /** Metadata for TikTok post */
  tiktok?: TikTokPostMetadataInput | null | undefined;
  /** Metadata for Twitter post */
  twitter?: TwitterPostMetadataInput | null | undefined;
  /** Metadata for Youtube post */
  youtube?: YoutubePostMetadataInput | null | undefined;
};

/** List of possible statuses for a Post */
export type PostStatus =
  | 'draft'
  | 'error'
  | 'needs_approval'
  | 'scheduled'
  | 'sending'
  | 'sent';

/** List of possible types for a Post. Some services may have different types (e.g., Instagram has story, reel, post but Twitter has only post) */
export type PostType =
  | 'carousel'
  | 'event'
  | 'ghost_post'
  | 'offer'
  | 'post'
  | 'reel'
  | 'short'
  | 'story'
  | 'thread'
  | 'whats_new';

/** List of specific post types available for Facebook */
export type PostTypeFacebook =
  | 'post'
  | 'reel'
  | 'story';

/** List of specific post types available for Google Business profiles */
export type PostTypeGoogleBusiness =
  | 'event'
  | 'offer'
  | 'whats_new';

/** List of possible ways to create a Post */
export type PostVia =
  | 'api'
  | 'buffer'
  | 'network';

/** Information about the initial Tweet that was retweeted */
export type RetweetMetadataInput = {
  /** Optional user comment shown above the embedded retweet */
  comment?: string | null | undefined;
  /** Retweet ID */
  id: string;
};

/** Indicates whether the post was scheduled for notification publishing or automatic publishing */
export type SchedulingType =
  /** Buffer's publishing workers send the post, with nobody having to act */
  | 'automatic'
  /** Buffer reminds someone to publish the post by hand */
  | 'notification';

/** The list of services that can be authorized. */
export type Service =
  | 'bluesky'
  | 'facebook'
  | 'googlebusiness'
  | 'instagram'
  | 'linkedin'
  | 'mastodon'
  | 'pinterest'
  | 'startPage'
  | 'substack'
  | 'threads'
  | 'tiktok'
  | 'twitter'
  | 'whatsapp'
  | 'youtube';

/** How the post is being scheduled. */
export type ShareMode =
  | 'addToQueue'
  | 'customScheduled'
  | 'shareNext'
  | 'shareNow';

/** Substack post metadata */
export type SubstackPostMetadataInput = {
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
};

/** Input type for tag information used in idea creation */
export type TagInput = {
  color: string;
  id: string | number;
  name: string;
};

/** The name and color to give a new tag. */
export type TagToCreateInput = {
  /**
   * The tag's color as a hex triplet: `#` followed by exactly six hex digits, for
   * example `#F523F1`. Shorthand such as `#F51` is rejected. Buffer maps
   * recognized palette colors onto `Tag.colorName`.
   */
  color: string;
  /**
   * The tag's display name, for example `Summer sales`. Between 1 and 100
   * characters, and unique within the organization. Names are compared exactly,
   * so `Summer sales` and `summer sales` can coexist.
   */
  name: string;
};

/** Bluesky fields on a single item of a thread */
export type ThreadItemBlueskyMetadataInput = {
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
};

/**
 * Service-specific fields on a single item of a thread. The key must match the
 * channel's service; input under any other key is rejected.
 */
export type ThreadItemMetadataInput = {
  /** Bluesky fields for this thread item */
  bluesky?: ThreadItemBlueskyMetadataInput | null | undefined;
  /** Threads fields for this thread item */
  threads?: ThreadItemThreadsMetadataInput | null | undefined;
};

/** Threads fields on a single item of a thread */
export type ThreadItemThreadsMetadataInput = {
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
};

/**
 * A post authored by the user which is posted to a thread.
 * This is commonly used for long-format twitter and meta threads posts to
 * allow authored content to span multiple threads.
 * Threads are represented as a list of replies, each replying to the previous one.
 * The first item in the list is the root post of the thread and should match the
 * top-level `text` on the post input; the remaining items are replies.
 */
export type ThreadedPostInput = {
  /** Ordered list of assets on this threaded post */
  assets?: Array<AssetInput>;
  /** Service-specific fields for this threaded post */
  metadata?: ThreadItemMetadataInput | null | undefined;
  /** The text body content of the threaded post */
  text?: string | null | undefined;
};

/** Threads post metadata */
export type ThreadsPostMetadataInput = {
  /** Link attachment. Mutually exclusive with a non-empty `assets` array — input providing both is rejected. */
  linkAttachment?: LinkAttachmentInput | null | undefined;
  /** LocationId associated with the post */
  locationId?: string | null | undefined;
  /** Location name associated with the post */
  locationName?: string | null | undefined;
  /**
   * The ordered list of posts that make up the thread (not paginated). This
   * array is the source of truth for what gets published: every post in the
   * thread, including the root post, must be provided here. Posts are
   * published in order, each replying to the previous one. The first item is
   * the root post and should match the top-level `text` on the post input.
   */
  thread?: Array<ThreadedPostInput> | null | undefined;
  /** Topic associated with the post */
  topic?: string | null | undefined;
  /** The type of the post */
  type?: PostType | null | undefined;
};

/** TikTok post metadata */
export type TikTokPostMetadataInput = {
  /** Whether the post discloses AI-generated content (TikTok video only) */
  isAiGenerated?: boolean | null | undefined;
  /** The title of the TikTok post (for photo posts) */
  title?: string | null | undefined;
};

/** Twitter post metadata */
export type TwitterPostMetadataInput = {
  /** Whether the post discloses AI-generated content (original tweets only, never retweets) */
  isAiGenerated?: boolean | null | undefined;
  /** The details of the tweet being retweeted */
  retweet?: RetweetMetadataInput | null | undefined;
  /**
   * The ordered list of posts that make up the thread (not paginated). This
   * array is the source of truth for what gets published: every post in the
   * thread, including the root post, must be provided here. Posts are
   * published in order, each replying to the previous one. The first item is
   * the root post and should match the top-level `text` on the post input.
   */
  thread?: Array<ThreadedPostInput> | null | undefined;
};

/** User tag in the image */
export type UserTagInput = {
  /** The handle (username) of the account to tag, without the leading @. */
  handle: string;
  /** Horizontal position of the tag as a normalized decimal float between 0.0 and 1.0 - the fraction of the image width from the left edge (0.5 is the horizontal center). Pass a number, not a string, and do not use pixel coordinates; to convert, divide the pixel X by the image width. */
  x: number;
  /** Vertical position of the tag as a normalized decimal float between 0.0 and 1.0 - the fraction of the image height from the top edge (0.5 is the vertical center). Pass a number, not a string, and do not use pixel coordinates; to convert, divide the pixel Y by the image height. */
  y: number;
};

/** Video asset */
export type VideoAssetInput = {
  /** Video specific metadata */
  metadata?: VideoMetadataInput | null | undefined;
  /**
   * Do not use: social networks do not accept custom video thumbnail images, and
   * the API rejects video assets that set this field. To choose the video
   * thumbnail, set `metadata.thumbnailOffset` to select a frame from the video
   * (supported for Instagram, TikTok, and Pinterest only).
   */
  thumbnailUrl?: string | null | undefined;
  /** URL to the file source */
  url: string;
};

/** Video metadata */
export type VideoMetadataInput = {
  /** Offset of the thumbnail chosen for the video, in ms */
  thumbnailOffset?: number | null | undefined;
  /** Video title */
  title?: string | null | undefined;
};

/** List of license types */
export type YoutubeLicense =
  | 'creativeCommon'
  | 'youtube';

/** Youtube post metadata */
export type YoutubePostMetadataInput = {
  /**
   * Youtube Category ID, one ID of this list:
   * ID: 1 -> Film & Animation
   * ID: 2 -> Autos & Vehicles
   * ID: 10 -> Music
   * ID: 15 -> Pets & Animals
   * ID: 17 -> Sports
   * ID: 19 -> Travel & Events
   * ID: 20 -> Gaming
   * ID: 22 -> People & Blogs
   * ID: 23 -> Comedy
   * ID: 24 -> Entertainment
   * ID: 25 -> News & Politics
   * ID: 26 -> Howto & Style
   * ID: 27 -> Education
   * ID: 28 -> Science & Technology
   * ID: 29 -> Nonprofits & Activism
   *
   * Required on create; optional on edit (omitted preserves existing value).
   */
  categoryId?: string | null | undefined;
  /** Indicates whether the video allows embedding (default: true) */
  embeddable?: boolean | null | undefined;
  /** Whether the post discloses AI-generated content */
  isAiGenerated?: boolean | null | undefined;
  /** Video license (default: youtube) */
  license?: YoutubeLicense | null | undefined;
  /** Indicates whether the video is suitable for kids (default: false) */
  madeForKids?: boolean | null | undefined;
  /** Indicates whether to notify subscribers on publish video (default: true) */
  notifySubscribers?: boolean | null | undefined;
  /** Privacy setting for post (default: public) */
  privacy?: YoutubePrivacy | null | undefined;
  /** Title of the Youtube post. Required on create; optional on edit (omitted preserves existing value). */
  title?: string | null | undefined;
};

/** List of privacy types */
export type YoutubePrivacy =
  | 'private'
  | 'public'
  | 'unlisted';

export type CreateIdeaMutationVariables = Exact<{
  input: CreateIdeaInput;
}>;


export type CreateIdeaMutation = { createIdea:
    | { __typename: 'Idea', id: string }
    | { __typename: 'IdeaResponse', idea: { id: string } | null }
    | { __typename: 'InvalidInputError', message: string }
    | { __typename: 'LimitReachedError', message: string }
    | { __typename: 'UnauthorizedError', message: string }
    | { __typename: 'UnexpectedError', message: string }
   };

export type CreateCollaborationNoteMutationVariables = Exact<{
  input: CreateCollaborationNoteInput;
}>;


export type CreateCollaborationNoteMutation = { createCollaborationNote:
    | { __typename: 'CollaborationNoteThreadClosedError', message: string }
    | { __typename: 'CreateCollaborationNoteSuccess', edge: { node: { id: string } } }
    | { __typename: 'InvalidInputError', message: string }
    | { __typename: 'LimitReachedError', message: string }
   };

export type CreateDraftMutationVariables = Exact<{
  input: CreatePostInput;
}>;


export type CreateDraftMutation = { createPost:
    | { __typename: 'InvalidInputError', message: string }
    | { __typename: 'LimitReachedError', message: string }
    | { __typename: 'NotFoundError', message: string }
    | { __typename: 'PostActionSuccess', post: { id: string, status: PostStatus, dueAt: string | null, channelId: string } }
    | { __typename: 'RestProxyError', message: string }
    | { __typename: 'UnauthorizedError', message: string }
    | { __typename: 'UnexpectedError', message: string }
   };

export type TagPostMutationVariables = Exact<{
  input: EditPostInput;
}>;


export type TagPostMutation = { editPost:
    | { __typename: 'InvalidInputError', message: string }
    | { __typename: 'LimitReachedError', message: string }
    | { __typename: 'NotFoundError', message: string }
    | { __typename: 'PostActionSuccess' }
    | { __typename: 'RestProxyError', message: string }
    | { __typename: 'UnauthorizedError', message: string }
    | { __typename: 'UnexpectedError', message: string }
   };

export type TagsQueryVariables = Exact<{
  organizationId: string;
  after?: string | null | undefined;
}>;


export type TagsQuery = { tagsV2: { pageInfo: { hasNextPage: boolean, endCursor: string | null }, edges: Array<{ node: { id: string, name: string } }> } };

export type CreateTagMutationVariables = Exact<{
  input: CreateTagInput;
}>;


export type CreateTagMutation = { createTag:
    | { __typename: 'DuplicateError', message: string }
    | { __typename: 'InvalidInputError', message: string }
    | { __typename: 'LimitReachedError', message: string }
    | { __typename: 'NotFoundError', message: string }
    | { __typename: 'RestProxyError', message: string }
    | { __typename: 'TagActionSuccess', tag: { id: string, name: string } }
    | { __typename: 'UnauthorizedError', message: string }
    | { __typename: 'UnexpectedError', message: string }
   };

export type AccountQueryVariables = Exact<{ [key: string]: never; }>;


export type AccountQuery = { account: { id: string, name: string | null, avatar: string, timezone: string | null, organizations: Array<{ id: string, name: string }> } };

export type ChannelsQueryVariables = Exact<{
  organizationId: string;
}>;


export type ChannelsQuery = { channels: Array<{ id: string, organizationId: string, service: Service, name: string, displayName: string | null, avatar: string, timezone: string, isDisconnected: boolean, isQueuePaused: boolean, isLocked: boolean, postingSchedule: Array<{ day: DayOfWeek, paused: boolean, times: Array<string> }> }> };

export type IdeaIdsQueryVariables = Exact<{
  organizationId: string;
  after?: string | null | undefined;
}>;


export type IdeaIdsQuery = { ideas: { edges: Array<{ node: { id: string } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type PostTextQueryVariables = Exact<{
  id: string;
}>;


export type PostTextQuery = { post: { id: string, text: string, status: PostStatus, channelId: string } };

export type ParticipantPostsQueryVariables = Exact<{
  organizationId: string;
  channelIds?: Array<string> | string | null | undefined;
  since: string;
  after?: string | null | undefined;
}>;


export type ParticipantPostsQuery = { posts: { edges: Array<{ node: { id: string, text: string, status: PostStatus, via: PostVia, dueAt: string | null, sentAt: string | null, createdAt: string, externalLink: string | null, channelId: string, tags: Array<{ id: string }>, error: { message: string, supportUrl: string | null } | null } }> | null, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type ScheduledPostsQueryVariables = Exact<{
  organizationId: string;
  channelIds?: Array<string> | string | null | undefined;
  start: string;
  end: string;
}>;


export type ScheduledPostsQuery = { posts: { edges: Array<{ node: { id: string, channelId: string, status: PostStatus, dueAt: string | null } }> | null } };

export type WeekPostingLimitsQueryVariables = Exact<{
  channelIds: Array<string> | string;
  d0?: string | null | undefined;
  d1?: string | null | undefined;
  d2?: string | null | undefined;
  d3?: string | null | undefined;
  d4?: string | null | undefined;
  d5?: string | null | undefined;
  d6?: string | null | undefined;
}>;


export type WeekPostingLimitsQuery = { d0: Array<{ channelId: string, isAtLimit: boolean }>, d1: Array<{ channelId: string, isAtLimit: boolean }>, d2: Array<{ channelId: string, isAtLimit: boolean }>, d3: Array<{ channelId: string, isAtLimit: boolean }>, d4: Array<{ channelId: string, isAtLimit: boolean }>, d5: Array<{ channelId: string, isAtLimit: boolean }>, d6: Array<{ channelId: string, isAtLimit: boolean }> };

export type PublicTemplatesQueryVariables = Exact<{
  organizationId: string;
  after?: string | null | undefined;
}>;


export type PublicTemplatesQuery = { postTemplates: { pageInfo: { hasNextPage: boolean, endCursor: string | null }, edges: Array<{ node: { id: string, title: string, description: string, body: string, emoji: string } }> } };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}

export const CreateIdeaDocument = new TypedDocumentString(`
    mutation CreateIdea($input: CreateIdeaInput!) {
  createIdea(input: $input) {
    __typename
    ... on Idea {
      id
    }
    ... on IdeaResponse {
      idea {
        id
      }
    }
    ... on MutationError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<CreateIdeaMutation, CreateIdeaMutationVariables>;
export const CreateCollaborationNoteDocument = new TypedDocumentString(`
    mutation CreateCollaborationNote($input: CreateCollaborationNoteInput!) {
  createCollaborationNote(input: $input) {
    __typename
    ... on CreateCollaborationNoteSuccess {
      edge {
        node {
          id
        }
      }
    }
    ... on MutationError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<CreateCollaborationNoteMutation, CreateCollaborationNoteMutationVariables>;
export const CreateDraftDocument = new TypedDocumentString(`
    mutation CreateDraft($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess {
      post {
        id
        status
        dueAt
        channelId
      }
    }
    ... on MutationError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<CreateDraftMutation, CreateDraftMutationVariables>;
export const TagPostDocument = new TypedDocumentString(`
    mutation TagPost($input: EditPostInput!) {
  editPost(input: $input) {
    __typename
    ... on MutationError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<TagPostMutation, TagPostMutationVariables>;
export const TagsDocument = new TypedDocumentString(`
    query Tags($organizationId: OrganizationId!, $after: String) {
  tagsV2(first: 100, after: $after, input: { organizationId: $organizationId }) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        name
      }
    }
  }
}
    `) as unknown as TypedDocumentString<TagsQuery, TagsQueryVariables>;
export const CreateTagDocument = new TypedDocumentString(`
    mutation CreateTag($input: CreateTagInput!) {
  createTag(input: $input) {
    __typename
    ... on TagActionSuccess {
      tag {
        id
        name
      }
    }
    ... on MutationError {
      message
    }
  }
}
    `) as unknown as TypedDocumentString<CreateTagMutation, CreateTagMutationVariables>;
export const AccountDocument = new TypedDocumentString(`
    query Account {
  account {
    id
    name
    avatar
    timezone
    organizations {
      id
      name
    }
  }
}
    `) as unknown as TypedDocumentString<AccountQuery, AccountQueryVariables>;
export const ChannelsDocument = new TypedDocumentString(`
    query Channels($organizationId: OrganizationId!) {
  channels(
    input: { organizationId: $organizationId, filter: { product: publish } }
  ) {
    id
    organizationId
    service
    name
    displayName
    avatar
    timezone
    isDisconnected
    isQueuePaused
    isLocked
    postingSchedule {
      day
      paused
      times
    }
  }
}
    `) as unknown as TypedDocumentString<ChannelsQuery, ChannelsQueryVariables>;
export const IdeaIdsDocument = new TypedDocumentString(`
    query IdeaIds($organizationId: OrganizationId!, $after: String) {
  ideas(first: 100, after: $after, input: { organizationId: $organizationId }) {
    edges {
      node {
        id
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `) as unknown as TypedDocumentString<IdeaIdsQuery, IdeaIdsQueryVariables>;
export const PostTextDocument = new TypedDocumentString(`
    query PostText($id: PostId!) {
  post(input: { id: $id }) {
    id
    text
    status
    channelId
  }
}
    `) as unknown as TypedDocumentString<PostTextQuery, PostTextQueryVariables>;
export const ParticipantPostsDocument = new TypedDocumentString(`
    query ParticipantPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!], $since: DateTime!, $after: String) {
  posts(
    first: 100
    after: $after
    input: {
      organizationId: $organizationId
      filter: {
        channelIds: $channelIds
        status: [draft, needs_approval, scheduled, sending, sent, error]
        createdAt: { start: $since }
      }
    }
  ) {
    edges {
      node {
        id
        text
        status
        via
        dueAt
        sentAt
        createdAt
        externalLink
        channelId
        tags {
          id
        }
        error {
          message
          supportUrl
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
    `) as unknown as TypedDocumentString<ParticipantPostsQuery, ParticipantPostsQueryVariables>;
export const ScheduledPostsDocument = new TypedDocumentString(`
    query ScheduledPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!], $start: DateTime!, $end: DateTime!) {
  posts(
    first: 100
    input: {
      organizationId: $organizationId
      filter: {
        channelIds: $channelIds
        status: [scheduled, draft]
        dueAt: { start: $start, end: $end }
      }
    }
  ) {
    edges {
      node {
        id
        channelId
        status
        dueAt
      }
    }
  }
}
    `) as unknown as TypedDocumentString<ScheduledPostsQuery, ScheduledPostsQueryVariables>;
export const WeekPostingLimitsDocument = new TypedDocumentString(`
    query WeekPostingLimits($channelIds: [ChannelId!]!, $d0: DateTime, $d1: DateTime, $d2: DateTime, $d3: DateTime, $d4: DateTime, $d5: DateTime, $d6: DateTime) {
  d0: dailyPostingLimits(input: { channelIds: $channelIds, date: $d0 }) {
    channelId
    isAtLimit
  }
  d1: dailyPostingLimits(input: { channelIds: $channelIds, date: $d1 }) {
    channelId
    isAtLimit
  }
  d2: dailyPostingLimits(input: { channelIds: $channelIds, date: $d2 }) {
    channelId
    isAtLimit
  }
  d3: dailyPostingLimits(input: { channelIds: $channelIds, date: $d3 }) {
    channelId
    isAtLimit
  }
  d4: dailyPostingLimits(input: { channelIds: $channelIds, date: $d4 }) {
    channelId
    isAtLimit
  }
  d5: dailyPostingLimits(input: { channelIds: $channelIds, date: $d5 }) {
    channelId
    isAtLimit
  }
  d6: dailyPostingLimits(input: { channelIds: $channelIds, date: $d6 }) {
    channelId
    isAtLimit
  }
}
    `) as unknown as TypedDocumentString<WeekPostingLimitsQuery, WeekPostingLimitsQueryVariables>;
export const PublicTemplatesDocument = new TypedDocumentString(`
    query PublicTemplates($organizationId: OrganizationId!, $after: String) {
  postTemplates(
    first: 100
    after: $after
    input: { organizationId: $organizationId, filter: { visibility: public } }
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
        description
        body
        emoji
      }
    }
  }
}
    `) as unknown as TypedDocumentString<PublicTemplatesQuery, PublicTemplatesQueryVariables>;