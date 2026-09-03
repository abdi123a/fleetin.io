import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader, SearchField } from '@/components';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconChip,
  Input,
  Label,
  Select,
  Skeleton,
} from '@/design-system';
import { FolderOpen, Plus } from '@/design-system/icons';
import { useCreateProject, useProjects, type ProjectRecord } from '@/features/finance';
import { useShippers } from '@/features/shippers/api/queries';
import { fmtDjf, fromMinorUnits } from '@/lib/finance';
import { cn } from '@/utils';

/**
 * Projects: the one grouping over shipments this module keeps.
 *
 * A project is a commercial agreement with one shipper — a contract, a season,
 * a site — that many shipments run under. It groups and it totals, and that is
 * the whole of it. In particular the monthly estimate is a PLANNING figure:
 * nothing gates, warns or blocks a shipment against it, and the card says so
 * by calling it what it is rather than dressing it as a budget.
 */
export function ProjectsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: projects = [], isLoading } = useProjects({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(term) || project.reference.toLowerCase().includes(term),
    );
  }, [projects, search]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader
        title="Projects"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 size-4" />
            New project
          </Button>
        }
      />

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Project name or reference"
        matched={filtered.length}
        total={projects.length}
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No projects yet. A project groups one shipper&rsquo;s shipments under a single agreement.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => navigate(`/finance/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectRecord; onOpen: () => void }) {
  const estimate = project.monthlyEstimateMinorUnits
    ? fromMinorUnits(project.monthlyEstimateMinorUnits, 'DJF')
    : null;
  const active = project.status === 'active';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
    >
      <IconChip icon={FolderOpen} size={36} tint={active ? 'teal' : 'neutral'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold text-foreground">{project.name}</p>
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              active
                ? 'border-success/25 bg-success/12 text-success'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {active ? 'Active' : 'Closed'}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{project.reference}</p>
        {estimate != null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="tabular-nums text-foreground">{fmtDjf(estimate)}</span> expected a month
          </p>
        ) : null}
      </div>
    </button>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateProject();
  const { data: shipperPage } = useShippers({ limit: 200 });
  const shippers = shipperPage?.items ?? [];
  const [name, setName] = useState('');
  const [shipperId, setShipperId] = useState('');
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [estimate, setEstimate] = useState('');

  const canSubmit = name.trim().length > 0 && shipperId.length > 0 && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        name: name.trim(),
        shipperId,
        startedAt: new Date(startedAt).toISOString(),
        monthlyEstimate: estimate ? Number(estimate) : undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setShipperId('');
          setEstimate('');
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader title="New project" />

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Q4 cement contract"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-shipper">Client</Label>
            <Select
              id="project-shipper"
              value={shipperId}
              onChange={(event) => setShipperId(event.target.value)}
              placeholder="Choose a shipper"
              options={shippers.map((shipper) => ({
                value: shipper.id,
                label: shipper.companyLegalName,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-start">Starts</Label>
            <Input
              id="project-start"
              type="date"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-estimate">Expected a month (DJF)</Label>
            <Input
              id="project-estimate"
              type="number"
              inputMode="numeric"
              value={estimate}
              onChange={(event) => setEstimate(event.target.value)}
              placeholder="Optional"
            />
            {/* Said out loud because the field looks exactly like a budget and
                is not one: nothing is ever refused for exceeding it. */}
            <p className="text-xs text-muted-foreground">
              A planning figure. Shipments are never blocked or warned against it.
            </p>
          </div>
        </div>

        {create.isError ? (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
