/**
 * Narrative Studio Page
 *
 * A dedicated interface for cinematic scriptwriting departments.
 * Provides project-centric view of the narrative development pipeline,
 * document versioning, and real-time progress tracking.
 *
 * Design: Extends technical blueprint aesthetic with writer's room warmth.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonGroup } from "@/components/ui/button-group";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Film,
  Plus,
  Search,
  FileText,
  CheckCircle,
  Clock,
  Loader2,
  BookOpen,
} from "@/components/ui/icons";

// Phase colors matching the spec
const PHASE_COLORS = {
  foundation: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30" },
  structure: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/30" },
  production: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  polish: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
} as const;

const STATUS_COLORS = {
  draft: { bg: "bg-muted", text: "text-muted-foreground" },
  in_progress: { bg: "bg-amber-500/10", text: "text-amber-400" },
  review: { bg: "bg-sky-500/10", text: "text-sky-400" },
  complete: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
} as const;

type ProjectPhase = "foundation" | "structure" | "production" | "polish";
type ProjectStatus = "draft" | "in_progress" | "review" | "complete";

interface NarrativeProject {
  id: string;
  name: string;
  logline: string;
  genre: string;
  estimatedRuntime: string;
  endingCount: number;
  status: ProjectStatus;
  phase: ProjectPhase;
  documentsApproved: number;
  documentsTotal: number;
  updatedAt: string;
}

// Mock data for demonstration
const MOCK_PROJECTS: NarrativeProject[] = [
  {
    id: "proj_1",
    name: "Operation Nightfall",
    logline:
      "A black ops team discovers their own government is the enemy, forcing them to become the very terrorists they were hunting.",
    genre: "Action-Thriller",
    estimatedRuntime: "90+ minutes",
    endingCount: 2,
    status: "in_progress",
    phase: "production",
    documentsApproved: 6,
    documentsTotal: 8,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "proj_2",
    name: "The Last Horizon",
    logline:
      "In a dying world, one pilot must choose between saving her family or the last seeds of humanity's future.",
    genre: "Sci-Fi Drama",
    estimatedRuntime: "120 minutes",
    endingCount: 2,
    status: "in_progress",
    phase: "foundation",
    documentsApproved: 1,
    documentsTotal: 8,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function NarrativeProjectCard({
  project,
  onClick,
  index,
}: {
  project: NarrativeProject;
  onClick: () => void;
  index: number;
}) {
  const phaseColors = PHASE_COLORS[project.phase];
  const statusColors = STATUS_COLORS[project.status];
  const progressPercent = Math.round((project.documentsApproved / project.documentsTotal) * 100);

  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]",
        "animate-in fade-in slide-in-from-bottom-2",
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
      onClick={onClick}
    >
      {/* Phase indicator strip */}
      <div className={cn("absolute left-0 top-0 h-full w-1", phaseColors.bg.replace("/10", ""))} />

      {/* Header */}
      <div className="relative p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center border",
              phaseColors.bg,
              phaseColors.border,
            )}
          >
            <Film className={cn("h-5 w-5", phaseColors.text)} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-medium text-foreground">{project.name}</h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{project.genre}</span>
              <span className="text-border">•</span>
              <span>{project.estimatedRuntime}</span>
              <span className="text-border">•</span>
              <span>{project.endingCount} Endings</span>
            </div>
          </div>
        </div>

        {/* Logline */}
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          "{project.logline}"
        </p>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className={cn("font-medium", phaseColors.text)}>
              Phase: {project.phase.charAt(0).toUpperCase() + project.phase.slice(1)}
            </span>
            <span className="text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden bg-muted">
            <div
              className={cn(
                "h-full transition-all duration-500",
                phaseColors.bg.replace("/10", ""),
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn("text-xs", statusColors.bg, statusColors.text)}>
              {project.status.replace("_", " ")}
            </Badge>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              <span>
                {project.documentsApproved}/{project.documentsTotal} docs
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(project.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type FilterPhase = "all" | ProjectPhase;

export function NarrativeStudio() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPhase, setFilterPhase] = useState<FilterPhase>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state for new project
  const [newProject, setNewProject] = useState({
    name: "",
    logline: "",
    genre: "Action-Thriller",
    estimatedRuntime: "90+ minutes",
    endingCount: 2,
  });

  // Use mock data for now (will be replaced with API call)
  const projects = MOCK_PROJECTS;
  const isLoading = false;

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        searchQuery === "" ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.logline.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPhase = filterPhase === "all" || p.phase === filterPhase;

      return matchesSearch && matchesPhase;
    });
  }, [projects, searchQuery, filterPhase]);

  // Stats
  const stats = useMemo(() => {
    const totalDocs = projects.reduce((acc, p) => acc + p.documentsTotal, 0);
    const approvedDocs = projects.reduce((acc, p) => acc + p.documentsApproved, 0);
    const activeProjects = projects.filter((p) => p.status === "in_progress").length;

    return { totalProjects: projects.length, totalDocs, approvedDocs, activeProjects };
  }, [projects]);

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.logline) return;

    setIsCreating(true);
    // TODO: Call API to create project
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsCreating(false);
    setCreateDialogOpen(false);
    setNewProject({
      name: "",
      logline: "",
      genre: "Action-Thriller",
      estimatedRuntime: "90+ minutes",
      endingCount: 2,
    });
    // navigate to new project
  };

  return (
    <Container className="py-6 lg:py-8 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-amber-500/30 bg-amber-500/10">
                <BookOpen className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Narrative Studio
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground hidden md:block">
                  Cinematic Scriptwriting Department
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </Button>
        </div>

        {/* Stats Bar */}
        <div className="mt-6 flex flex-wrap items-center gap-6 border border-border/50 bg-card/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{stats.totalProjects}</span>
            <span className="text-xs text-muted-foreground">Projects</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{stats.totalDocs}</span>
            <span className="text-xs text-muted-foreground">Documents</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">{stats.approvedDocs}</span>
            <span className="text-xs text-muted-foreground">Approved</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium">{stats.activeProjects}</span>
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="mt-4 flex flex-col gap-4 border-b border-border/50 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 bg-card pl-9 text-sm"
            />
          </div>
          <ButtonGroup>
            <Button
              variant={filterPhase === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPhase("all")}
              className="h-8 text-xs"
            >
              All Phases
            </Button>
            <Button
              variant={filterPhase === "foundation" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPhase("foundation")}
              className={cn("h-8 text-xs", filterPhase === "foundation" && "bg-violet-500")}
            >
              Foundation
            </Button>
            <Button
              variant={filterPhase === "structure" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPhase("structure")}
              className={cn("h-8 text-xs", filterPhase === "structure" && "bg-sky-500")}
            >
              Structure
            </Button>
            <Button
              variant={filterPhase === "production" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPhase("production")}
              className={cn("h-8 text-xs", filterPhase === "production" && "bg-amber-500")}
            >
              Production
            </Button>
            <Button
              variant={filterPhase === "polish" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterPhase("polish")}
              className={cn("h-8 text-xs", filterPhase === "polish" && "bg-emerald-500")}
            >
              Polish
            </Button>
          </ButtonGroup>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="h-12 w-12 border-2 border-border" />
            <div className="absolute inset-0 h-12 w-12 animate-spin border-2 border-amber-400 border-t-transparent" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading projects...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center border border-amber-500/30 bg-amber-500/10">
            <BookOpen className="h-8 w-8 text-amber-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No projects found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery || filterPhase !== "all"
              ? "Try adjusting your search or filter"
              : "Create your first narrative project to get started"}
          </p>
          {!searchQuery && filterPhase === "all" && (
            <Button
              className="mt-6 bg-amber-500 hover:bg-amber-600"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Project
            </Button>
          )}
        </div>
      )}

      {/* Projects Grid */}
      {!isLoading && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredProjects.map((project, index) => (
            <NarrativeProjectCard
              key={project.id}
              project={project}
              index={index}
              onClick={() => navigate(`/narrative-studio/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-amber-400" />
              New Narrative Project
            </DialogTitle>
            <DialogDescription>
              Create a new game narrative project. The 8 narrative agents will help you develop your
              story from concept to final screenplay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                placeholder="Operation Nightfall"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logline">Logline</Label>
              <Textarea
                id="logline"
                placeholder="A one-sentence hook that captures the essence of your story..."
                value={newProject.logline}
                onChange={(e) => setNewProject({ ...newProject, logline: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The irresistible one-liner that sells your story. Maximum 50 words.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select
                  value={newProject.genre}
                  onValueChange={(v) => v && setNewProject({ ...newProject, genre: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Action-Thriller">Action-Thriller</SelectItem>
                    <SelectItem value="Sci-Fi Drama">Sci-Fi Drama</SelectItem>
                    <SelectItem value="Fantasy Adventure">Fantasy Adventure</SelectItem>
                    <SelectItem value="Horror">Horror</SelectItem>
                    <SelectItem value="Military Shooter">Military Shooter</SelectItem>
                    <SelectItem value="RPG Fantasy">RPG Fantasy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Endings</Label>
                <Select
                  value={String(newProject.endingCount)}
                  onValueChange={(v) =>
                    v && setNewProject({ ...newProject, endingCount: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Ending (Linear)</SelectItem>
                    <SelectItem value="2">2 Endings</SelectItem>
                    <SelectItem value="3">3 Endings</SelectItem>
                    <SelectItem value="4">4+ Endings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Estimated Runtime</Label>
              <Select
                value={newProject.estimatedRuntime}
                onValueChange={(v) => v && setNewProject({ ...newProject, estimatedRuntime: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30-60 minutes">30-60 minutes</SelectItem>
                  <SelectItem value="60-90 minutes">60-90 minutes</SelectItem>
                  <SelectItem value="90+ minutes">90+ minutes</SelectItem>
                  <SelectItem value="120+ minutes">120+ minutes (Epic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={isCreating || !newProject.name || !newProject.logline}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
