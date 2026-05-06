"use client";

import Link from "next/link";
import { Folder } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import type { Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="group h-full cursor-pointer transition-colors hover:border-primary/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="truncate">{project.name}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {project.description ?? "Sem descrição."}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <Badge variant={project.status === "active" ? "success" : "muted"}>
              {project.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              criado {formatRelative(project.created_at)}
            </span>
          </div>
          <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
            {project.path}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
