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

// Define types for cursor positions
interface CursorPosition {
  x: number;
  y: number;
  selection?: {
    start: number;
    end: number;
    blockId?: string;
  };
}

// CSS for remote cursors
const cursorStyles = `
  .remote-cursor {
    position: absolute;
    pointer-events: none;
    z-index: 30;
    transition: transform 0.1s ease;
  }
  .remote-cursor::before {
    content: '';
    position: absolute;
    width: 2px;
    height: 20px;
    background-color: currentColor;
    left: 0;
    top: 0;
  }
  .remote-cursor::after {
    content: attr(data-name);
    position: absolute;
    background-color: currentColor;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    white-space: nowrap;
    left: 0;
    top: -20px;
  }
`;

const Editor = ({ onChange, initialContent, editable = true, documentId, isLocalUpdate }: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cursorUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  
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
  const updateCursor = useMutation(api.documents.updateCursorPosition);
  
  // Track mouse movement for cursor position
  const handleMouseMove = (e: MouseEvent) => {
    if (!editorContainerRef.current || !user) return;
    
    // Get the container's position
    const rect = editorContainerRef.current.getBoundingClientRect();
    
    // Calculate relative position within the editor
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Store the new position
    const newPosition = { x, y };
    setCursorPosition(newPosition);
    
    // Debounce the cursor position updates to reduce server load
    if (cursorUpdateTimerRef.current) {
      clearTimeout(cursorUpdateTimerRef.current);
    }
    
    cursorUpdateTimerRef.current = setTimeout(() => {
      updateCursor({
        documentId: documentId as Id<"documents">,
        userId: user.id,
        cursorPosition: newPosition
      });
    }, 50); // Update every 50ms max to avoid too many requests
  };
  
  // Register this user as active when the component mounts
  useEffect(() => {
    if (user && documentId) {
      registerUser({
        documentId: documentId as Id<"documents">,
        userId: user.id,
        userName: user.fullName || "Anonymous",
        userImageUrl: user.imageUrl || "",
        lastActive: Date.now(),
        cursorPosition: cursorPosition || undefined
      });
      
      // Set up interval to update "lastActive" timestamp
      const interval = setInterval(() => {
        registerUser({
          documentId: documentId as Id<"documents">,
          userId: user.id,
          userName: user.fullName || "Anonymous",
          userImageUrl: user.imageUrl || "",
          lastActive: Date.now(),
          cursorPosition: cursorPosition || undefined
        });
      }, 30000); // Update every 30 seconds
      
      // Add event listener for cursor tracking
      if (editorContainerRef.current) {
        editorContainerRef.current.addEventListener('mousemove', handleMouseMove);
      }
      
      // Inject the CSS styles for cursors
      const styleElement = document.createElement('style');
      styleElement.textContent = cursorStyles;
      document.head.appendChild(styleElement);
      
      // Unregister when component unmounts
      return () => {
        clearInterval(interval);
        unregisterUser({
          documentId: documentId as Id<"documents">,
          userId: user.id
        });
        
        if (editorContainerRef.current) {
          editorContainerRef.current.removeEventListener('mousemove', handleMouseMove);
        }
        
        document.head.removeChild(styleElement);
      };
    }
  }, [user, documentId, registerUser, unregisterUser, updateCursor]);

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

  // Render remote cursors
  const renderRemoteCursors = () => {
    if (!user) return null;
    
    return activeUsers
      .filter(activeUser => 
        activeUser.userId !== user.id && 
        activeUser.cursorPosition
      )
      .map(activeUser => {
        // Generate a unique color based on the user's ID
        const color = `hsl(${hashString(activeUser.userId) % 360}, 70%, 50%)`;
        
        return (
          <div 
            key={activeUser.userId}
            className="remote-cursor"
            data-name={activeUser.userName}
            style={{
              transform: `translate(${activeUser.cursorPosition?.x || 0}px, ${activeUser.cursorPosition?.y || 0}px)`,
              color
            }}
          />
        );
      });
  };
  
  // Simple hash function for generating colors from user IDs
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  return (
    <div className="relative" ref={editorContainerRef}>
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
      
      {/* Render remote cursors */}
      {renderRemoteCursors()}
      
      {/* Local cursor visualization (helps the user see their own cursor) */}
      {user && cursorPosition && (
        <div 
          className="remote-cursor"
          data-name={`${user.fullName || 'You'} (You)`}
          style={{
            transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)`,
            color: "rgba(59, 130, 246, 0.5)", // Blue with transparency
            opacity: 0.5 // Make it semi-transparent so it doesn't interfere with editing
          }}
        />
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
