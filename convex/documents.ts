import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;
    const email = identity.email;
    const isElytraRobotics = email === "elytrarobotics@gmail.com";
    
    const existingDocument = await ctx.db.get(args.id);
    
    if (!existingDocument) {
      throw new Error("Not found");
    }
    
    if (isElytraRobotics || existingDocument.userId === userId) {
      // Recursively archive all child documents
      const recursiveArchive = async (documentId: Id<"documents">) => {
        const children = await ctx.db
          .query("documents")
          .withIndex("by_parent", (q) => 
            q.eq("parentDocument", documentId)
          )
          .collect();

        for (const child of children) {
          await ctx.db.patch(child._id, {
            isArchived: true
          });

          await recursiveArchive(child._id);
        }
      };

      // Archive the parent document
      const document = await ctx.db.patch(args.id, {
        isArchived: true
      });
      
      // Archive all children
      await recursiveArchive(args.id);
      
      return document;
    }
    
    throw new Error("Failed to archive note.");
  },
});

export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_parent", (q) => 
        q.eq("parentDocument", args.parentDocument)
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const document = await ctx.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
    });

    return document;
  },
});

export const getTrash = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    return documents;
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const exisingDocument = await ctx.db.get(args.id);

    if (!exisingDocument) {
      throw new Error("Document not found");
    }

    if (exisingDocument.userId !== userId) {
      throw new Error("Not authorized");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId),
        )
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: false,
        });

        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = {
      isArchived: false,
    };

    if (exisingDocument.parentDocument) {
      const parent = await ctx.db.get(exisingDocument.parentDocument);

      if (parent?.isArchived) {
        options.parentDocument = undefined;
      }
    }

    const document = await ctx.db.patch(args.id, options);

    recursiveRestore(args.id);

    return document;
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const exisingDocument = await ctx.db.get(args.id);

    if (!exisingDocument) {
      throw new Error("Document not found");
    }

    if (exisingDocument.userId !== userId) {
      throw new Error("Not authorized");
    }

    const document = await ctx.db.delete(args.id);

    return document;
  },
});

export const getSearch = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

export const getById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    // Only check for authentication
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      return null; // Return null instead of throwing an error for not found
    }

    // Return any document as long as the user is authenticated
    return document;
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const { id, ...rest } = args;

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Document not found");
    }

    const document = await ctx.db.patch(args.id, {
      ...rest,
    });

    return document;
  },
});

export const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Document not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.patch(args.id, {
      icon: undefined,
    });

    return document;
  },
});

export const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const userId = identity.subject;

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Document not found");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const document = await ctx.db.patch(args.id, {
      coverImage: undefined,
    });

    return document;
  },
});

export const registerActiveUser = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    
    // Check if this user is already registered
    const existingUser = await ctx.db
      .query("activeUsers")
      .withIndex("by_document_user", (q) => 
        q.eq("documentId", args.documentId).eq("userId", args.userId)
      )
      .unique();
    
    if (existingUser) {
      // Update the lastActive timestamp and cursor position
      return await ctx.db.patch(existingUser._id, {
        lastActive: args.lastActive,
        cursorPosition: args.cursorPosition
      });
    } else {
      // Register new active user
      return await ctx.db.insert("activeUsers", {
        documentId: args.documentId,
        userId: args.userId,
        userName: args.userName,
        userImageUrl: args.userImageUrl,
        lastActive: args.lastActive,
        cursorPosition: args.cursorPosition
      });
    }
  }
});

export const unregisterActiveUser = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    
    // Find and delete the active user entry
    const activeUser = await ctx.db
      .query("activeUsers")
      .withIndex("by_document_user", (q) => 
        q.eq("documentId", args.documentId).eq("userId", args.userId)
      )
      .unique();
    
    if (activeUser) {
      await ctx.db.delete(activeUser._id);
    }
    
    return { success: true };
  }
});

export const getActiveUsers = query({
  args: {
    documentId: v.id("documents")
  },
  handler: async (ctx, args) => {
    // Get all active users, filtering out any that haven't been active in the last 2 minutes
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    
    return await ctx.db
      .query("activeUsers")
      .withIndex("by_document_user", (q) => q.eq("documentId", args.documentId))
      .filter((q) => q.gt(q.field("lastActive"), twoMinutesAgo))
      .collect();
  }
});

// Add a new mutation for real-time cursor position updates
export const updateCursorPosition = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    cursorPosition: v.object({
      x: v.number(),
      y: v.number(),
      selection: v.optional(v.object({
        start: v.number(),
        end: v.number(),
        blockId: v.optional(v.string())
      }))
    })
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    
    // Find the active user entry
    const activeUser = await ctx.db
      .query("activeUsers")
      .withIndex("by_document_user", (q) => 
        q.eq("documentId", args.documentId).eq("userId", args.userId)
      )
      .unique();
    
    if (activeUser) {
      // Update just the cursor position and activity time
      return await ctx.db.patch(activeUser._id, {
        cursorPosition: args.cursorPosition,
        lastActive: Date.now()
      });
    }
    
    // If no existing record, return null (client should call registerActiveUser instead)
    return null;
  }
});
