import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    userId: v.string(),
    isArchived: v.boolean(),
    parentDocument: v.optional(v.id("documents")),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentDocument"])
    .index("by_parent", ["parentDocument"]),

  activeUsers: defineTable({
    documentId: v.id("documents"),
    userId: v.string(),
    userName: v.string(),
    userImageUrl: v.optional(v.string()),
    lastActive: v.number(),
    cursorPosition: v.optional(v.object({
      x: v.number(),
      y: v.number(),
      selection: v.optional(v.object({
        start: v.number(),
        end: v.number(),
        blockId: v.optional(v.string())
      }))
    }))
  })
  .index("by_document", ["documentId"])
  .index("by_document_user", ["documentId", "userId"]),
});
