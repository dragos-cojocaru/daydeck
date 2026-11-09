/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation CreateIdea($input: CreateIdeaInput!) {\n    createIdea(input: $input) {\n      __typename\n      ... on Idea {\n        id\n      }\n      ... on IdeaResponse {\n        idea {\n          id\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": typeof types.CreateIdeaDocument,
    "\n  mutation CreateCollaborationNote($input: CreateCollaborationNoteInput!) {\n    createCollaborationNote(input: $input) {\n      __typename\n      ... on CreateCollaborationNoteSuccess {\n        edge {\n          node {\n            id\n          }\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": typeof types.CreateCollaborationNoteDocument,
    "\n  mutation CreateDraft($input: CreatePostInput!) {\n    createPost(input: $input) {\n      __typename\n      ... on PostActionSuccess {\n        post {\n          id\n          status\n          dueAt\n          channelId\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": typeof types.CreateDraftDocument,
    "\n  mutation TagPost($input: EditPostInput!) {\n    editPost(input: $input) {\n      __typename\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": typeof types.TagPostDocument,
    "\n  query Tags($organizationId: OrganizationId!, $after: String) {\n    tagsV2(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          name\n        }\n      }\n    }\n  }\n": typeof types.TagsDocument,
    "\n  mutation CreateTag($input: CreateTagInput!) {\n    createTag(input: $input) {\n      __typename\n      ... on TagActionSuccess {\n        tag {\n          id\n          name\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": typeof types.CreateTagDocument,
    "\n  query Account {\n    account {\n      id\n      name\n      avatar\n      timezone\n      organizations {\n        id\n        name\n      }\n    }\n  }\n": typeof types.AccountDocument,
    "\n  query Channels($organizationId: OrganizationId!) {\n    channels(input: { organizationId: $organizationId, filter: { product: publish } }) {\n      id\n      organizationId\n      service\n      name\n      displayName\n      avatar\n      timezone\n      isDisconnected\n      isQueuePaused\n      isLocked\n      postingSchedule {\n        day\n        paused\n        times\n      }\n    }\n  }\n": typeof types.ChannelsDocument,
    "\n  query IdeaIds($organizationId: OrganizationId!, $after: String) {\n    ideas(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      edges {\n        node {\n          id\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.IdeaIdsDocument,
    "\n  query PostText($id: PostId!) {\n    post(input: { id: $id }) {\n      id\n      text\n      status\n      channelId\n    }\n  }\n": typeof types.PostTextDocument,
    "\n  query ParticipantPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $since: DateTime!\n    $after: String\n  ) {\n    posts(\n      first: 100\n      after: $after\n      input: {\n        organizationId: $organizationId\n        filter: {\n          channelIds: $channelIds\n          status: [draft, needs_approval, scheduled, sending, sent, error]\n          createdAt: { start: $since }\n        }\n      }\n    ) {\n      edges {\n        node {\n          id\n          text\n          status\n          via\n          dueAt\n          sentAt\n          createdAt\n          externalLink\n          channelId\n          tags {\n            id\n          }\n          error {\n            message\n            supportUrl\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": typeof types.ParticipantPostsDocument,
    "\n  query ScheduledPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $start: DateTime!\n    $end: DateTime!\n  ) {\n    posts(\n      first: 100\n      input: {\n        organizationId: $organizationId\n        filter: { channelIds: $channelIds, status: [scheduled, draft], dueAt: { start: $start, end: $end } }\n      }\n    ) {\n      edges {\n        node {\n          id\n          channelId\n          status\n          dueAt\n        }\n      }\n    }\n  }\n": typeof types.ScheduledPostsDocument,
    "\n  query WeekPostingLimits(\n    $channelIds: [ChannelId!]!\n    $d0: DateTime\n    $d1: DateTime\n    $d2: DateTime\n    $d3: DateTime\n    $d4: DateTime\n    $d5: DateTime\n    $d6: DateTime\n  ) {\n    d0: dailyPostingLimits(input: { channelIds: $channelIds, date: $d0 }) { channelId isAtLimit }\n    d1: dailyPostingLimits(input: { channelIds: $channelIds, date: $d1 }) { channelId isAtLimit }\n    d2: dailyPostingLimits(input: { channelIds: $channelIds, date: $d2 }) { channelId isAtLimit }\n    d3: dailyPostingLimits(input: { channelIds: $channelIds, date: $d3 }) { channelId isAtLimit }\n    d4: dailyPostingLimits(input: { channelIds: $channelIds, date: $d4 }) { channelId isAtLimit }\n    d5: dailyPostingLimits(input: { channelIds: $channelIds, date: $d5 }) { channelId isAtLimit }\n    d6: dailyPostingLimits(input: { channelIds: $channelIds, date: $d6 }) { channelId isAtLimit }\n  }\n": typeof types.WeekPostingLimitsDocument,
    "\n  query PublicTemplates($organizationId: OrganizationId!, $after: String) {\n    postTemplates(\n      first: 100\n      after: $after\n      input: { organizationId: $organizationId, filter: { visibility: public } }\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          title\n          description\n          body\n          emoji\n        }\n      }\n    }\n  }\n": typeof types.PublicTemplatesDocument,
};
const documents: Documents = {
    "\n  mutation CreateIdea($input: CreateIdeaInput!) {\n    createIdea(input: $input) {\n      __typename\n      ... on Idea {\n        id\n      }\n      ... on IdeaResponse {\n        idea {\n          id\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": types.CreateIdeaDocument,
    "\n  mutation CreateCollaborationNote($input: CreateCollaborationNoteInput!) {\n    createCollaborationNote(input: $input) {\n      __typename\n      ... on CreateCollaborationNoteSuccess {\n        edge {\n          node {\n            id\n          }\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": types.CreateCollaborationNoteDocument,
    "\n  mutation CreateDraft($input: CreatePostInput!) {\n    createPost(input: $input) {\n      __typename\n      ... on PostActionSuccess {\n        post {\n          id\n          status\n          dueAt\n          channelId\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": types.CreateDraftDocument,
    "\n  mutation TagPost($input: EditPostInput!) {\n    editPost(input: $input) {\n      __typename\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": types.TagPostDocument,
    "\n  query Tags($organizationId: OrganizationId!, $after: String) {\n    tagsV2(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          name\n        }\n      }\n    }\n  }\n": types.TagsDocument,
    "\n  mutation CreateTag($input: CreateTagInput!) {\n    createTag(input: $input) {\n      __typename\n      ... on TagActionSuccess {\n        tag {\n          id\n          name\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n": types.CreateTagDocument,
    "\n  query Account {\n    account {\n      id\n      name\n      avatar\n      timezone\n      organizations {\n        id\n        name\n      }\n    }\n  }\n": types.AccountDocument,
    "\n  query Channels($organizationId: OrganizationId!) {\n    channels(input: { organizationId: $organizationId, filter: { product: publish } }) {\n      id\n      organizationId\n      service\n      name\n      displayName\n      avatar\n      timezone\n      isDisconnected\n      isQueuePaused\n      isLocked\n      postingSchedule {\n        day\n        paused\n        times\n      }\n    }\n  }\n": types.ChannelsDocument,
    "\n  query IdeaIds($organizationId: OrganizationId!, $after: String) {\n    ideas(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      edges {\n        node {\n          id\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.IdeaIdsDocument,
    "\n  query PostText($id: PostId!) {\n    post(input: { id: $id }) {\n      id\n      text\n      status\n      channelId\n    }\n  }\n": types.PostTextDocument,
    "\n  query ParticipantPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $since: DateTime!\n    $after: String\n  ) {\n    posts(\n      first: 100\n      after: $after\n      input: {\n        organizationId: $organizationId\n        filter: {\n          channelIds: $channelIds\n          status: [draft, needs_approval, scheduled, sending, sent, error]\n          createdAt: { start: $since }\n        }\n      }\n    ) {\n      edges {\n        node {\n          id\n          text\n          status\n          via\n          dueAt\n          sentAt\n          createdAt\n          externalLink\n          channelId\n          tags {\n            id\n          }\n          error {\n            message\n            supportUrl\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n": types.ParticipantPostsDocument,
    "\n  query ScheduledPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $start: DateTime!\n    $end: DateTime!\n  ) {\n    posts(\n      first: 100\n      input: {\n        organizationId: $organizationId\n        filter: { channelIds: $channelIds, status: [scheduled, draft], dueAt: { start: $start, end: $end } }\n      }\n    ) {\n      edges {\n        node {\n          id\n          channelId\n          status\n          dueAt\n        }\n      }\n    }\n  }\n": types.ScheduledPostsDocument,
    "\n  query WeekPostingLimits(\n    $channelIds: [ChannelId!]!\n    $d0: DateTime\n    $d1: DateTime\n    $d2: DateTime\n    $d3: DateTime\n    $d4: DateTime\n    $d5: DateTime\n    $d6: DateTime\n  ) {\n    d0: dailyPostingLimits(input: { channelIds: $channelIds, date: $d0 }) { channelId isAtLimit }\n    d1: dailyPostingLimits(input: { channelIds: $channelIds, date: $d1 }) { channelId isAtLimit }\n    d2: dailyPostingLimits(input: { channelIds: $channelIds, date: $d2 }) { channelId isAtLimit }\n    d3: dailyPostingLimits(input: { channelIds: $channelIds, date: $d3 }) { channelId isAtLimit }\n    d4: dailyPostingLimits(input: { channelIds: $channelIds, date: $d4 }) { channelId isAtLimit }\n    d5: dailyPostingLimits(input: { channelIds: $channelIds, date: $d5 }) { channelId isAtLimit }\n    d6: dailyPostingLimits(input: { channelIds: $channelIds, date: $d6 }) { channelId isAtLimit }\n  }\n": types.WeekPostingLimitsDocument,
    "\n  query PublicTemplates($organizationId: OrganizationId!, $after: String) {\n    postTemplates(\n      first: 100\n      after: $after\n      input: { organizationId: $organizationId, filter: { visibility: public } }\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          title\n          description\n          body\n          emoji\n        }\n      }\n    }\n  }\n": types.PublicTemplatesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateIdea($input: CreateIdeaInput!) {\n    createIdea(input: $input) {\n      __typename\n      ... on Idea {\n        id\n      }\n      ... on IdeaResponse {\n        idea {\n          id\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').CreateIdeaDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateCollaborationNote($input: CreateCollaborationNoteInput!) {\n    createCollaborationNote(input: $input) {\n      __typename\n      ... on CreateCollaborationNoteSuccess {\n        edge {\n          node {\n            id\n          }\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').CreateCollaborationNoteDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateDraft($input: CreatePostInput!) {\n    createPost(input: $input) {\n      __typename\n      ... on PostActionSuccess {\n        post {\n          id\n          status\n          dueAt\n          channelId\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').CreateDraftDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation TagPost($input: EditPostInput!) {\n    editPost(input: $input) {\n      __typename\n      ... on MutationError {\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').TagPostDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Tags($organizationId: OrganizationId!, $after: String) {\n    tagsV2(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          name\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').TagsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateTag($input: CreateTagInput!) {\n    createTag(input: $input) {\n      __typename\n      ... on TagActionSuccess {\n        tag {\n          id\n          name\n        }\n      }\n      ... on MutationError {\n        message\n      }\n    }\n  }\n"): typeof import('./graphql').CreateTagDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Account {\n    account {\n      id\n      name\n      avatar\n      timezone\n      organizations {\n        id\n        name\n      }\n    }\n  }\n"): typeof import('./graphql').AccountDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Channels($organizationId: OrganizationId!) {\n    channels(input: { organizationId: $organizationId, filter: { product: publish } }) {\n      id\n      organizationId\n      service\n      name\n      displayName\n      avatar\n      timezone\n      isDisconnected\n      isQueuePaused\n      isLocked\n      postingSchedule {\n        day\n        paused\n        times\n      }\n    }\n  }\n"): typeof import('./graphql').ChannelsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query IdeaIds($organizationId: OrganizationId!, $after: String) {\n    ideas(first: 100, after: $after, input: { organizationId: $organizationId }) {\n      edges {\n        node {\n          id\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): typeof import('./graphql').IdeaIdsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PostText($id: PostId!) {\n    post(input: { id: $id }) {\n      id\n      text\n      status\n      channelId\n    }\n  }\n"): typeof import('./graphql').PostTextDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ParticipantPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $since: DateTime!\n    $after: String\n  ) {\n    posts(\n      first: 100\n      after: $after\n      input: {\n        organizationId: $organizationId\n        filter: {\n          channelIds: $channelIds\n          status: [draft, needs_approval, scheduled, sending, sent, error]\n          createdAt: { start: $since }\n        }\n      }\n    ) {\n      edges {\n        node {\n          id\n          text\n          status\n          via\n          dueAt\n          sentAt\n          createdAt\n          externalLink\n          channelId\n          tags {\n            id\n          }\n          error {\n            message\n            supportUrl\n          }\n        }\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n    }\n  }\n"): typeof import('./graphql').ParticipantPostsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ScheduledPosts(\n    $organizationId: OrganizationId!\n    $channelIds: [ChannelId!]\n    $start: DateTime!\n    $end: DateTime!\n  ) {\n    posts(\n      first: 100\n      input: {\n        organizationId: $organizationId\n        filter: { channelIds: $channelIds, status: [scheduled, draft], dueAt: { start: $start, end: $end } }\n      }\n    ) {\n      edges {\n        node {\n          id\n          channelId\n          status\n          dueAt\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').ScheduledPostsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WeekPostingLimits(\n    $channelIds: [ChannelId!]!\n    $d0: DateTime\n    $d1: DateTime\n    $d2: DateTime\n    $d3: DateTime\n    $d4: DateTime\n    $d5: DateTime\n    $d6: DateTime\n  ) {\n    d0: dailyPostingLimits(input: { channelIds: $channelIds, date: $d0 }) { channelId isAtLimit }\n    d1: dailyPostingLimits(input: { channelIds: $channelIds, date: $d1 }) { channelId isAtLimit }\n    d2: dailyPostingLimits(input: { channelIds: $channelIds, date: $d2 }) { channelId isAtLimit }\n    d3: dailyPostingLimits(input: { channelIds: $channelIds, date: $d3 }) { channelId isAtLimit }\n    d4: dailyPostingLimits(input: { channelIds: $channelIds, date: $d4 }) { channelId isAtLimit }\n    d5: dailyPostingLimits(input: { channelIds: $channelIds, date: $d5 }) { channelId isAtLimit }\n    d6: dailyPostingLimits(input: { channelIds: $channelIds, date: $d6 }) { channelId isAtLimit }\n  }\n"): typeof import('./graphql').WeekPostingLimitsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PublicTemplates($organizationId: OrganizationId!, $after: String) {\n    postTemplates(\n      first: 100\n      after: $after\n      input: { organizationId: $organizationId, filter: { visibility: public } }\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      edges {\n        node {\n          id\n          title\n          description\n          body\n          emoji\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').PublicTemplatesDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
