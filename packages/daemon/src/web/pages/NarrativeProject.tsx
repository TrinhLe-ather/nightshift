/**
 * Narrative Project Detail Page
 *
 * Shows the complete narrative development pipeline for a project.
 * Visualizes the 8 narrative agents and their document outputs.
 * Provides real-time progress tracking and document version control.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/Container";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Film,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
  BookOpen,
  Eye,
  RefreshCw,
  Plus,
} from "@/components/ui/icons";

// Phase colors matching the spec
const PHASE_COLORS = {
  foundation: {
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    border: "border-violet-500/30",
    solid: "bg-violet-500",
  },
  structure: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    border: "border-sky-500/30",
    solid: "bg-sky-500",
  },
  production: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/30",
    solid: "bg-amber-500",
  },
  polish: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
    solid: "bg-emerald-500",
  },
} as const;

const DOCUMENT_STATUS_COLORS = {
  not_started: { bg: "bg-muted", text: "text-muted-foreground", icon: Clock },
  generating: { bg: "bg-amber-500/10", text: "text-amber-400", icon: Loader2 },
  draft: { bg: "bg-sky-500/10", text: "text-sky-400", icon: FileText },
  review: { bg: "bg-violet-500/10", text: "text-violet-400", icon: Eye },
  approved: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle },
} as const;

type ProjectPhase = "foundation" | "structure" | "production" | "polish";
type DocumentStatus = "not_started" | "generating" | "draft" | "review" | "approved";

interface NarrativeAgent {
  id: string;
  name: string;
  workflowId: string;
  phase: ProjectPhase;
  description: string;
  documentType: string;
}

interface NarrativeDocument {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  currentVersion: number;
  agentId: string;
  updatedAt: string;
  approvedAt?: string;
}

interface NarrativeProject {
  id: string;
  name: string;
  logline: string;
  synopsis?: string;
  genre: string;
  estimatedRuntime: string;
  endingCount: number;
  status: "draft" | "in_progress" | "review" | "complete";
  phase: ProjectPhase;
  updatedAt: string;
}

// The 8 Narrative Agents organized by phase
const NARRATIVE_AGENTS: NarrativeAgent[] = [
  // Foundation Phase (Violet)
  {
    id: "story-architect",
    name: "Story Architect",
    workflowId: "story-architect",
    phase: "foundation",
    description: "Creates the Story Bible - world, themes, and narrative foundation",
    documentType: "story_bible",
  },
  {
    id: "world-builder",
    name: "World Builder",
    workflowId: "world-builder",
    phase: "foundation",
    description: "Develops the World Bible - locations, lore, and environment",
    documentType: "world_bible",
  },
  {
    id: "character-architect",
    name: "Character Architect",
    workflowId: "character-architect",
    phase: "foundation",
    description: "Crafts the Character Bible - protagonists, antagonists, arcs",
    documentType: "character_bible",
  },
  // Structure Phase (Sky)
  {
    id: "plot-designer",
    name: "Plot Designer",
    workflowId: "plot-designer",
    phase: "structure",
    description: "Designs Plot Structure - acts, beats, and branching paths",
    documentType: "plot_structure",
  },
  // Production Phase (Amber)
  {
    id: "cinematic-screenwriter",
    name: "Cinematic Screenwriter",
    workflowId: "cinematic-screenwriter",
    phase: "production",
    description: "Writes the Screenplay - scenes, dialogue, action lines",
    documentType: "screenplay",
  },
  {
    id: "dialogue-specialist",
    name: "Dialogue Specialist",
    workflowId: "dialogue-specialist",
    phase: "production",
    description: "Polishes dialogue for character voice and impact",
    documentType: "dialogue_polish",
  },
  {
    id: "cinematic-director",
    name: "Cinematic Director",
    workflowId: "cinematic-director",
    phase: "production",
    description: "Adds Director's Notes - camera, pacing, visual storytelling",
    documentType: "directors_notes",
  },
  // Polish Phase (Emerald)
  {
    id: "story-editor",
    name: "Story Editor",
    workflowId: "story-editor",
    phase: "polish",
    description: "Final Editorial Report - coherence, pacing, quality",
    documentType: "editorial_report",
  },
];

// Mock project data
const MOCK_PROJECT: NarrativeProject = {
  id: "proj_1",
  name: "Operation Nightfall",
  logline:
    "A black ops team discovers their own government is the enemy, forcing them to become the very terrorists they were hunting.",
  synopsis:
    "When Delta Force operator Marcus Cole uncovers a conspiracy reaching the highest levels of government, he must go rogue with his team to expose the truth. Hunted by the very forces he once commanded, Marcus navigates a world where every ally could be an enemy, and the line between patriot and terrorist blurs.",
  genre: "Action-Thriller",
  estimatedRuntime: "90+ minutes",
  endingCount: 2,
  status: "in_progress",
  phase: "production",
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

// Mock documents
const MOCK_DOCUMENTS: NarrativeDocument[] = [
  {
    id: "doc_1",
    name: "Story Bible",
    type: "story_bible",
    status: "approved",
    currentVersion: 3,
    agentId: "story-architect",
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    approvedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_2",
    name: "World Bible",
    type: "world_bible",
    status: "approved",
    currentVersion: 2,
    agentId: "world-builder",
    updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    approvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_3",
    name: "Character Bible",
    type: "character_bible",
    status: "approved",
    currentVersion: 4,
    agentId: "character-architect",
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_4",
    name: "Plot Structure",
    type: "plot_structure",
    status: "approved",
    currentVersion: 2,
    agentId: "plot-designer",
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_5",
    name: "Screenplay",
    type: "screenplay",
    status: "generating",
    currentVersion: 1,
    agentId: "cinematic-screenwriter",
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_6",
    name: "Dialogue Polish",
    type: "dialogue_polish",
    status: "not_started",
    currentVersion: 0,
    agentId: "dialogue-specialist",
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_7",
    name: "Director's Notes",
    type: "directors_notes",
    status: "not_started",
    currentVersion: 0,
    agentId: "cinematic-director",
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "doc_8",
    name: "Editorial Report",
    type: "editorial_report",
    status: "not_started",
    currentVersion: 0,
    agentId: "story-editor",
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

/**
 * Agent Pipeline Card Component
 *
 * Displays a single agent in the pipeline with its status and document preview.
 */
function AgentCard({
  agent,
  document,
  isActive,
  onClick,
}: {
  agent: NarrativeAgent;
  document?: NarrativeDocument;
  isActive: boolean;
  onClick: () => void;
}) {
  const phaseColors = PHASE_COLORS[agent.phase];
  const status = document?.status || "not_started";
  const statusConfig = DOCUMENT_STATUS_COLORS[status];
  const StatusIcon = statusConfig.icon;
  const isGenerating = status === "generating";

  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden border bg-card transition-all duration-300",
        "hover:border-primary/50 hover:shadow-[0_0_15px_rgba(var(--primary),0.1)]",
        isActive && "ring-2 ring-primary/50",
      )}
      onClick={onClick}
    >
      {/* Phase indicator */}
      <div className={cn("absolute left-0 top-0 h-full w-1", phaseColors.solid)} />

      <div className="p-4 pl-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-foreground">{agent.name}</h4>
              {isGenerating && <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 hidden md:block">
              {agent.description}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-xs", statusConfig.bg, statusConfig.text)}
          >
            <StatusIcon className={cn("mr-1 h-3 w-3", isGenerating && "animate-spin")} />
            {status.replace("_", " ")}
          </Badge>
        </div>

        {/* Document info */}
        {document && document.currentVersion > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>{document.name}</span>
              <span className="text-border">•</span>
              <span>v{document.currentVersion}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(document.updatedAt)}
            </span>
          </div>
        )}

        {/* Action buttons on hover */}
        <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {status === "not_started" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Play className="h-3 w-3" />
              Generate
            </Button>
          )}
          {status === "generating" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Pause className="h-3 w-3" />
              Pause
            </Button>
          )}
          {(status === "draft" || status === "review") && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                <Eye className="h-3 w-3" />
                View
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </Button>
            </>
          )}
          {status === "approved" && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Eye className="h-3 w-3" />
              View
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Phase Section Component
 *
 * Groups agents by their development phase.
 */
function PhaseSection({
  phase,
  agents,
  documents,
  selectedAgentId,
  onSelectAgent,
}: {
  phase: ProjectPhase;
  agents: NarrativeAgent[];
  documents: NarrativeDocument[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  const phaseColors = PHASE_COLORS[phase];
  const phaseNames = {
    foundation: "Foundation",
    structure: "Structure",
    production: "Production",
    polish: "Polish",
  };

  const completedCount = agents.filter((a) => {
    const doc = documents.find((d) => d.agentId === a.id);
    return doc?.status === "approved";
  }).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cn("h-3 w-3", phaseColors.solid)} />
        <h3 className={cn("text-sm font-medium", phaseColors.text)}>{phaseNames[phase]}</h3>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{agents.length} approved
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const document = documents.find((d) => d.agentId === agent.id);
          return (
            <AgentCard
              key={agent.id}
              agent={agent}
              document={document}
              isActive={selectedAgentId === agent.id}
              onClick={() => onSelectAgent(agent.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Document Preview Panel
 *
 * Shows document details and version history when an agent is selected.
 */
function DocumentPreviewPanel({
  agent,
  document,
  onClose,
}: {
  agent: NarrativeAgent;
  document?: NarrativeDocument;
  onClose: () => void;
}) {
  const phaseColors = PHASE_COLORS[agent.phase];
  const status = document?.status || "not_started";
  const statusConfig = DOCUMENT_STATUS_COLORS[status];
  const StatusIcon = statusConfig.icon;

  // Mock version history
  const versions =
    document && document.currentVersion > 0
      ? Array.from({ length: document.currentVersion }, (_, i) => ({
          version: document.currentVersion - i,
          createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          changesSummary: i === 0 ? "Current version" : `Revision ${document.currentVersion - i}`,
        }))
      : [];

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className={cn("border-b p-4", phaseColors.bg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center border",
                phaseColors.border,
              )}
            >
              <BookOpen className={cn("h-5 w-5", phaseColors.text)} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground">{agent.name}</h3>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            &times;
          </Button>
        </div>
      </div>

      {/* Status */}
      <div className="border-b border-border/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant="outline" className={cn("text-xs", statusConfig.bg, statusConfig.text)}>
            <StatusIcon className={cn("mr-1 h-3 w-3", status === "generating" && "animate-spin")} />
            {status.replace("_", " ")}
          </Badge>
        </div>
        {document && document.currentVersion > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Version</span>
            <span className="text-sm font-medium">v{document.currentVersion}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-b border-border/50 p-4">
        <div className="flex flex-wrap gap-2">
          {status === "not_started" && (
            <Button className="flex-1 gap-2" size="sm">
              <Play className="h-4 w-4" />
              Generate Document
            </Button>
          )}
          {status === "generating" && (
            <Button variant="outline" className="flex-1 gap-2" size="sm">
              <Pause className="h-4 w-4" />
              Pause Generation
            </Button>
          )}
          {(status === "draft" || status === "review") && (
            <>
              <Button variant="outline" className="flex-1 gap-2" size="sm">
                <Eye className="h-4 w-4" />
                View Document
              </Button>
              <Button className="flex-1 gap-2" size="sm">
                <CheckCircle className="h-4 w-4" />
                Approve
              </Button>
            </>
          )}
          {status === "approved" && (
            <>
              <Button variant="outline" className="flex-1 gap-2" size="sm">
                <Eye className="h-4 w-4" />
                View Document
              </Button>
              <Button variant="outline" className="flex-1 gap-2" size="sm">
                <RefreshCw className="h-4 w-4" />
                Create Revision
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Version History */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/50 p-4">
          <h4 className="text-sm font-medium">Version History</h4>
          {versions.length > 0 && (
            <span className="text-xs text-muted-foreground">{versions.length} versions</span>
          )}
        </div>
        <ScrollArea className="h-[calc(100%-48px)]">
          <div className="p-4">
            {versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No versions yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Generate the document to create the first version
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((v, i) => (
                  <div
                    key={v.version}
                    className={cn(
                      "flex items-center justify-between border p-3 text-sm",
                      i === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center text-xs font-medium",
                          i === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        v{v.version}
                      </div>
                      <span className="text-muted-foreground">{v.changesSummary}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(v.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function NarrativeProject() {
  const navigate = useNavigate();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pipeline");

  // Use mock data for now (will be replaced with API call)
  const project = MOCK_PROJECT;
  const documents = MOCK_DOCUMENTS;
  const isLoading = false;

  // Group agents by phase
  const agentsByPhase = useMemo(() => {
    const phases: ProjectPhase[] = ["foundation", "structure", "production", "polish"];
    return phases.map((phase) => ({
      phase,
      agents: NARRATIVE_AGENTS.filter((a) => a.phase === phase),
    }));
  }, []);

  const selectedAgent = selectedAgentId
    ? NARRATIVE_AGENTS.find((a) => a.id === selectedAgentId)
    : null;
  const selectedDocument = selectedAgentId
    ? documents.find((d) => d.agentId === selectedAgentId)
    : undefined;

  // Calculate progress
  const approvedCount = documents.filter((d) => d.status === "approved").length;
  const totalCount = NARRATIVE_AGENTS.length;
  const progressPercent = Math.round((approvedCount / totalCount) * 100);

  const phaseColors = PHASE_COLORS[project.phase];

  if (isLoading) {
    return (
      <Container className="py-4 lg:py-6 flex items-center justify-center">
        <div className="relative">
          <div className="h-12 w-12 border-2 border-border" />
          <div className="absolute inset-0 h-12 w-12 animate-spin border-2 border-amber-400 border-t-transparent" />
        </div>
      </Container>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={cn("flex-1 overflow-auto", selectedAgent && "lg:pr-[400px]")}>
        <Container className="py-4 lg:py-6">
          {/* Back Button + Header */}
          <div className="mb-4 lg:mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/narrative-studio")}
              className="mb-3 lg:mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </Button>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center border",
                    phaseColors.bg,
                    phaseColors.border,
                  )}
                >
                  <Film className={cn("h-6 w-6", phaseColors.text)} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    {project.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2 max-w-2xl">
                    "{project.logline}"
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{project.genre}</span>
                    <span className="text-border">|</span>
                    <span>{project.estimatedRuntime}</span>
                    <span className="text-border">|</span>
                    <span>{project.endingCount} Endings</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Run Pipeline
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 lg:mt-6 border border-border/50 bg-card/50 p-3 lg:p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn("font-medium", phaseColors.text)}>
                    Phase: {project.phase.charAt(0).toUpperCase() + project.phase.slice(1)}
                  </span>
                </div>
                <span className="text-muted-foreground">
                  {approvedCount}/{totalCount} documents approved ({progressPercent}%)
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden bg-muted">
                <div
                  className={cn("h-full transition-all duration-500", phaseColors.solid)}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start border-b border-border bg-transparent p-0">
              <TabsTrigger
                value="pipeline"
                className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Agent Pipeline
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Documents
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pipeline" className="mt-4 lg:mt-6">
              <div className="space-y-4 lg:space-y-6">
                {agentsByPhase.map(({ phase, agents }) => (
                  <PhaseSection
                    key={phase}
                    phase={phase}
                    agents={agents}
                    documents={documents}
                    selectedAgentId={selectedAgentId}
                    onSelectAgent={setSelectedAgentId}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-4 lg:mt-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc) => {
                  const agent = NARRATIVE_AGENTS.find((a) => a.id === doc.agentId);
                  const phaseColors = agent ? PHASE_COLORS[agent.phase] : PHASE_COLORS.foundation;
                  const statusConfig = DOCUMENT_STATUS_COLORS[doc.status];
                  const StatusIcon = statusConfig.icon;

                  return (
                    <div
                      key={doc.id}
                      className="group cursor-pointer border bg-card p-4 transition-all hover:border-primary/50"
                      onClick={() => setSelectedAgentId(doc.agentId)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn("h-8 w-1", phaseColors.solid)} />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium">{doc.name}</h4>
                          <p className="text-xs text-muted-foreground">{agent?.name}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-xs", statusConfig.bg, statusConfig.text)}
                        >
                          <StatusIcon
                            className={cn(
                              "mr-1 h-3 w-3",
                              doc.status === "generating" && "animate-spin",
                            )}
                          />
                          {doc.status.replace("_", " ")}
                        </Badge>
                      </div>
                      {doc.currentVersion > 0 && (
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Version {doc.currentVersion}</span>
                          <span>{formatRelativeTime(doc.updatedAt)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="mt-4 lg:mt-6">
              <div className="border border-border bg-card p-4 lg:p-6">
                <h3 className="text-base font-medium">Project Settings</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure project details, linked repository, and output preferences.
                </p>
                <div className="mt-4 lg:mt-6 text-sm text-muted-foreground">
                  Settings panel coming soon...
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Container>
      </div>

      {/* Side Panel */}
      {selectedAgent && (
        <div className="fixed right-0 top-0 z-40 hidden h-full w-[400px] lg:block">
          <DocumentPreviewPanel
            agent={selectedAgent}
            document={selectedDocument}
            onClose={() => setSelectedAgentId(null)}
          />
        </div>
      )}
    </div>
  );
}
