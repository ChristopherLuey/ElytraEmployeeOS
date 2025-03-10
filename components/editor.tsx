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
  
  // Get current active users for this document
  const activeUsers = useQuery(api.documents.getActiveUsers, {
    documentId: documentId as Id<"documents">,
  }) || [];
  
  // Get real-time document updates
  const documentData = useQuery(api.documents.getById, {
    documentId: documentId as Id<"documents">,
  });
  
  // Create a ref to store the current editor content
  const currentContentRef = useRef<string | null>(initialContent || null);
  
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

  // Create a ref to store the editor instance
  const editorRef = useRef<BlockNoteEditor | null>(null);
  
  // Create a boolean ref to track if we're currently updating from remote
  const isRemoteUpdateRef = useRef(false);

  // Initialize the editor with the initial content
  const editor = useCreateBlockNote({
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock[])
      : undefined,
    uploadFile: handleUpload,
  });
  
  // Store a reference to the editor instance
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Listen for document changes from the server
  useEffect(() => {
    if (!documentData || !documentData.content || isLocalUpdate?.current || !editorRef.current) return;
    
    // Don't update if this is our own change
    if (documentData.content === currentContentRef.current) return;
    
    try {
      // Mark that we're updating from remote, so we don't trigger onChange
      isRemoteUpdateRef.current = true;
      
      // Parse the new content
      const newContent = JSON.parse(documentData.content) as PartialBlock[];
      
      // Update our current content ref
      currentContentRef.current = documentData.content;
      
      // Set the new content in the editor
      // We need to completely replace the editor content
      const currentBlocks = editorRef.current.document;
      editorRef.current.replaceBlocks(currentBlocks, newContent);
      
      console.log("Updated editor with remote changes");
      
      // Reset the remote update flag after a small delay
      setTimeout(() => {
        isRemoteUpdateRef.current = false;
      }, 100);
    } catch (error) {
      console.error("Failed to update editor with remote changes:", error);
      isRemoteUpdateRef.current = false;
    }
  }, [documentData?.content, isLocalUpdate]);

  // Handle local changes
  const handleEditorChange = () => {
    if (!editor || isRemoteUpdateRef.current) return;
    
    setIsEditing(true);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for debounced updates
    debounceTimerRef.current = setTimeout(() => {
      try {
        // Update isLocalUpdate to prevent loops
        if (isLocalUpdate) isLocalUpdate.current = true;
        
        // Get editor content as JSON string
        const content = JSON.stringify(editor.document, null, 2);
        
        // Update our local content ref
        currentContentRef.current = content;
        
        // Send the update to the server
        onChange(content);
        
        // Reset after a short delay
        setTimeout(() => {
          if (isLocalUpdate) isLocalUpdate.current = false;
          setIsEditing(false);
        }, 500);
      } catch (error) {
        console.error("Error saving document:", error);
        setIsEditing(false);
        if (isLocalUpdate) isLocalUpdate.current = false;
      }
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
