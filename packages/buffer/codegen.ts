import type { CodegenConfig } from "@graphql-codegen/cli";

// Generates typed documents from the committed schema.graphql.
// documentMode "string" keeps queries as plain strings, which our fetch wrapper sends as-is.
const config: CodegenConfig = {
  schema: "./schema.graphql",
  documents: ["src/**/*.ts", "!src/gql/**"],
  ignoreNoDocuments: true,
  generates: {
    "./src/gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        useTypeImports: true,
        // Buffer sends every custom scalar (IDs, dates, URLs) as a string.
        strictScalars: true,
        scalars: {
          URL: "string",
          DateTime: "string",
          AccountId: "string",
          ChannelId: "string",
          IdeaId: "string",
          InvitationId: "string",
          NoteId: "string",
          DraftId: "string",
          OrganizationId: "string",
          PostId: "string",
          TagId: "string",
          SnippetId: "string",
          PostTemplateId: "string",
          ContentItemId: "string",
          DraftContentId: "string",
          Uuid: "string",
          Email: "string",
        },
      },
    },
  },
};

export default config;
