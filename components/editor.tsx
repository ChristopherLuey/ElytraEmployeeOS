"use client";

import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import { useEdgeStore } from "@/lib/edgestore";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";
import { useEffect, useState, useRef } from "react";
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
}

const Editor = ({ onChange, initialContent, editable = true, documentId }: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get current active users for this document
  const activeUsers = useQuery(api.documents.getActiveUsers, {
    documentId: documentId as Id<"documents">,
  }) || [];
  
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

  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock[])
      : undefined,
    uploadFile: handleUpload,
  });

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
      onChange(JSON.stringify(editor.document, null, 2));
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
