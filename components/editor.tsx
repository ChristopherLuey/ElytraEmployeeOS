"use client";

import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import { useEdgeStore } from "@/lib/edgestore";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useRef, MutableRefObject } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { UserIcon } from "lucide-react";
import { useUser } from "@clerk/clerk-react";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
  documentId: string;
  isLocalUpdate?: MutableRefObject<boolean>;
}

const Editor = ({ onChange, initialContent, editable = true, documentId, isLocalUpdate }: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<BlockNoteEditor | null>(null);
  const lastContentRef = useRef<string | null>(null);
  
  // Track if editor is mounted
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  // Get current active users for this document
  const activeUsers = useQuery(api.documents.getActiveUsers, {
    documentId: documentId as Id<"documents">,
  }) || [];
  
  // Query the document content for real-time updates
  const documentData = useQuery(api.documents.getById, {
    documentId: documentId as Id<"documents">,
  });
  
  // Mutations for managing active users
  const registerUser = useMutation(api.documents.registerActiveUser);
  const unregisterUser = useMutation(api.documents.unregisterActiveUser);
  
  // Register this user as active when the component mounts
  useEffect(() => {
    if (user && documentId) {
      registerUser({
        documentId: documentId as Id<"documents">,
        userId: user.id,
        userName: user.fullName || "Anonymous",
        userImageUrl: user.imageUrl || "",
        lastActive: Date.now()
      });
      
      // Set up interval to update "lastActive" timestamp
      const interval = setInterval(() => {
        registerUser({
          documentId: documentId as Id<"documents">,
          userId: user.id,
          userName: user.fullName || "Anonymous",
          userImageUrl: user.imageUrl || "",
          lastActive: Date.now()
        });
      }, 30000); // Update every 30 seconds
      
      // Unregister when component unmounts
      return () => {
        clearInterval(interval);
        unregisterUser({
          documentId: documentId as Id<"documents">,
          userId: user.id
        });
      };
    }
  }, [user, documentId, registerUser, unregisterUser]);

  const handleUpload = async (file: File) => {
    const res = await edgestore.publicFiles.upload({
      file,
    });
    return res.url;
  };

  // Setup the editor
  const editor = useCreateBlockNote({
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock[])
      : undefined,
    uploadFile: handleUpload,
  });

  // Save editor reference
  useEffect(() => {
    editorRef.current = editor;
    setIsEditorReady(true);
    if (initialContent) {
      lastContentRef.current = initialContent;
    }
  }, [editor, initialContent]);

  // Handle real-time updates from other users
  useEffect(() => {
    // Skip if we're not ready or if this is a local update
    if (!isEditorReady || !documentData || !documentData.content || isLocalUpdate?.current) {
      return;
    }
    
    // Skip if content hasn't changed
    if (lastContentRef.current === documentData.content) {
      return;
    }
    
    // Update the editor content
    try {
      const newContent = JSON.parse(documentData.content);
      editorRef.current?.replaceBlocks(editorRef.current.document, newContent);
      lastContentRef.current = documentData.content;
      console.log("Updated editor with remote changes");
    } catch (error) {
      console.error("Failed to parse document content:", error);
    }
  }, [documentData?.content, isEditorReady, isLocalUpdate]);

  // Debounced onChange to avoid too many updates
  const handleEditorChange = () => {
    if (!editor) return;
    
    setIsEditing(true);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      const content = JSON.stringify(editor.document, null, 2);
      lastContentRef.current = content; // Update last content to avoid loops
      onChange(content);
      setIsEditing(false);
    }, 500);
  };

  return (
    <div className="relative">
      {/* Show active collaborators */}
      {activeUsers.length > 0 && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-500">
          <span>
            {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} active
            {isEditing && " • Saving..."}
          </span>
          <div className="flex -space-x-2">
            {activeUsers.slice(0, 3).map((activeUser) => (
              <div 
                key={activeUser.userId}
                className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white"
                title={activeUser.userName}
              >
                {activeUser.userImageUrl ? (
                  <img 
                    src={activeUser.userImageUrl} 
                    alt={activeUser.userName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserIcon className="h-3 w-3" />
                )}
              </div>
            ))}
            {activeUsers.length > 3 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs">
                +{activeUsers.length - 3}
              </div>
            )}
          </div>
        </div>
      )}
      
      <BlockNoteView
        editable={editable}
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleEditorChange}
      />
    </div>
  );
};

export default Editor;
