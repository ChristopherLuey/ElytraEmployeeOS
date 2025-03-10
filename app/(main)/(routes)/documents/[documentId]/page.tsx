"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";

import { Cover } from "@/components/cover";
import { Toolbar } from "@/components/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

interface DocumentIdPageProps {
  params: {
    documentId: Id<"documents">;
  };
}

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  // Track if we're causing the update
  const isLocalUpdate = useRef(false);
  
  const document = useQuery(api.documents.getById, {
    documentId: params.documentId,
  });

  const update = useMutation(api.documents.update);

  const onChange = (content: string) => {
    // Mark as local update
    isLocalUpdate.current = true;
    
    const promise = update({
      id: params.documentId,
      content,
    });
    
    // Show error if there's a problem updating
    promise.catch(() => {
      toast.error("Failed to save changes");
    });
    
    // Reset local update flag after a delay
    setTimeout(() => {
      isLocalUpdate.current = false;
    }, 1000);
  };

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="mx-auto mt-10 md:max-w-3xl lg:max-w-4xl">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null) {
    return <div>Not found</div>;
  }

  return (
    <div className="pb-40">
      <Cover url={document.coverImage} />
      <div className="mx-auto md:max-w-3xl lg:max-w-4xl">
        <Toolbar initialData={document} />
        <Editor 
          onChange={onChange} 
          initialContent={document.content} 
          documentId={params.documentId}
          isLocalUpdate={isLocalUpdate}
        />
      </div>
    </div>
  );
};

export default DocumentIdPage;
