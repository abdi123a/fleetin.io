import React from 'react';
import type { MissionTimelineStep } from '@/types/mission';
import { Card, Badge, Button } from '@/design-system';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  MapPin,
  User,
  Upload,
  ExternalLink,
  ChevronRight,
} from '@/design-system/icons';

interface MissionTimelineProps {
  timeline: MissionTimelineStep[];
  onUploadPOD?: () => void;
  onUpdateStep?: (stepId: string) => void;
}

export const MissionTimeline: React.FC<MissionTimelineProps> = ({
  timeline,
  onUploadPOD,
  onUpdateStep,
}) => {
  const getStepIcon = (status: MissionTimelineStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-success-subtle-foreground" />;
      case 'current':
        return <Clock className="w-4 h-4 text-primary animate-pulse motion-reduce:animate-none" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />;
    }
  };

  const getStepBadge = (status: MissionTimelineStep['status']) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="subtle" intent="success" size="sm">
            Completed
          </Badge>
        );
      case 'current':
        return (
          <Badge variant="subtle" intent="primary" size="sm">
            In Progress
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="subtle" intent="destructive" size="sm">
            Failed / Void
          </Badge>
        );
      default:
        return (
          <Badge variant="subtle" intent="default" size="sm">
            Pending
          </Badge>
        );
    }
  };

  return (
    <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Mission Lifecycle & Audit Timeline
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequential progression across all 10 key operational milestones.
          </p>
        </div>

        {onUploadPOD && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUploadPOD}
            className="rounded-lg text-xs gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload POD Document
          </Button>
        )}
      </div>

      {/* Timeline Steps List */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-border/80">
        {timeline.map((step) => {
          const isCompleted = step.status === 'completed';
          const isCurrent = step.status === 'current';

          return (
            <div key={step.id} className="relative group">
              {/* Node Icon Circle */}
              <div
                className={`absolute -left-6 top-1.5 transform -translate-x-1/2 w-6 h-6 rounded-full border flex items-center justify-center bg-card transition-colors ${
                  isCompleted
                    ? 'border-success/40 bg-success-subtle'
                    : isCurrent
                      ? 'border-primary bg-primary/10 shadow-xs'
                      : 'border-border bg-background'
                }`}
              >
                {getStepIcon(step.status)}
              </div>

              {/* Step Content Card */}
              <div className="bg-background/60 p-4 rounded-lg border border-border/70 group-hover:border-primary/40 transition space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-extrabold text-sm text-foreground">{step.title}</span>
                    {getStepBadge(step.status)}
                  </div>

                  {step.timestamp && (
                    <span className="text-xs font-mono font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
                      {step.timestamp}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">{step.description}</p>

                {/* Additional Meta Badges */}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap pt-1">
                  {step.actor && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-primary/70" />
                      <strong className="text-foreground">{step.actor}</strong>
                    </span>
                  )}

                  {step.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-primary/70" />
                      <span>{step.location}</span>
                    </span>
                  )}

                  {step.podFileUrl && (
                    <a
                      href={step.podFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      View POD Document
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {step.key === 'pod_upload' && !step.podFileUrl && isCurrent && (
                    <button
                      type="button"
                      onClick={onUploadPOD}
                      className="text-primary font-bold hover:underline inline-flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      Upload File Now
                    </button>
                  )}

                  {onUpdateStep && step.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => onUpdateStep(step.id)}
                      className="ml-auto text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      Mark Complete
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
