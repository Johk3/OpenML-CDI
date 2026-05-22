import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  FileText,
  Calendar,
  Download,
  Trash2,
} from 'lucide-react';
import { Dataset, DatasetStatus } from '../types/auth';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { BackendDataset } from '@/types/dataset';
import { canReopenRejectedDataset, hasReviewReadyFiles } from '@/lib/datasetReadiness';

function toFrontendDataset(b: BackendDataset): Dataset {
  const metadata = b.dataset_metadata || {};
  let description = '';
  let metrics: Dataset['metrics'];
  let croissantMetadata: Dataset['croissantMetadata'];

  const descriptionValue = metadata.description;
  if (typeof descriptionValue === 'string') {
    description = descriptionValue;
  } else if (
    typeof descriptionValue === 'object' &&
    descriptionValue !== null &&
    typeof (descriptionValue as { text?: unknown }).text === 'string'
  ) {
    description = (descriptionValue as { text: string }).text;
  }

  const metricsValue = metadata.metrics;
  if (
    typeof metricsValue === 'object' &&
    metricsValue !== null &&
    typeof (metricsValue as { instances?: unknown }).instances === 'number' &&
    typeof (metricsValue as { features?: unknown }).features === 'number'
  ) {
    metrics = {
      instances: (metricsValue as { instances: number }).instances,
      features: (metricsValue as { features: number }).features,
    };
  }

  const croissantValue = metadata.croissantMetadata;
  if (typeof croissantValue === 'object' && croissantValue !== null) {
    croissantMetadata = croissantValue as Dataset['croissantMetadata'];
  }

  return {
    id: b.id || 'no-id',
    title: b.title || 'Untitled Dataset',
    description: description || 'No description provided.',
    date: b.created_at ? b.created_at.slice(0, 10) : 'Unknown',
    status: (b.status || 'pending') as DatasetStatus,
    metrics,
    croissantMetadata,
    lifecycle: b.lifecycle,
    rawMetadata: metadata,
  };
}

const STATUS_CONFIG: Partial<
  Record<DatasetStatus, { label: string; icon: React.ReactNode; cls: string }>
> = {
  pending_upload: {
    label: 'Pending Upload',
    icon: <Clock size={13} />,
    cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  },
  uploaded: {
    label: 'Upload Verified',
    icon: <CheckCircle2 size={13} />,
    cls: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',
  },
  scanning: {
    label: 'Ongoing Processing',
    icon: <Loader2 size={13} className="animate-spin" />,
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
  },
  pending_review: {
    label: 'Pending Expert Review',
    icon: <Clock size={13} />,
    cls: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-700',
  },
  pending: {
    label: 'Pending Expert Review',
    icon: <Clock size={13} />,
    cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  },
  converted: {
    label: 'Ongoing Processing',
    icon: <Loader2 size={13} className="animate-spin" />,
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
  },
  claimed: {
    label: 'Verified & Published',
    icon: <CheckCircle2 size={13} />,
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  quarantined: {
    label: 'Quarantined',
    icon: <AlertCircle size={13} />,
    cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  },
  approved: {
    label: 'Approved',
    icon: <CheckCircle2 size={13} />,
    cls: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
  },
  rejected: {
    label: 'Rejected',
    icon: <AlertCircle size={13} />,
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  },
  published: {
    label: 'Published',
    icon: <Database size={13} />,
    cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  integration_failed: {
    label: 'Processing Error',
    icon: <AlertCircle size={13} />,
    cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  },
};

const StatusBadge = ({ status }: { status: DatasetStatus }) => {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    icon: <Clock size={13} />,
    cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

const toExpertSelectStatus = (status: DatasetStatus): DatasetStatus => {
  if (status === 'pending') return 'pending_review';
  if (status === 'converted') return 'approved';
  if (status === 'claimed') return 'published';
  return status;
};

const DOWNLOADABLE_DATASET_STATUSES: DatasetStatus[] = [
  'pending_review',
  'pending',
  'approved',
  'converted',
  'published',
  'claimed',
];

const isDatasetStatusDownloadable = (status: DatasetStatus): boolean =>
  DOWNLOADABLE_DATASET_STATUSES.includes(status);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getActionErrorMessage = (error: unknown, fallback: string): string => {
  if (isRecord(error) && isRecord(error.response)) {
    const data = error.response.data;
    if (isRecord(data) && typeof data.detail === 'string') {
      return data.detail;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const downloadMessageForStatus = (status: DatasetStatus, available: boolean): string => {
  if (!available) return 'Dataset files are not ready for download.';
  if (toExpertSelectStatus(status) === 'pending_review') {
    return 'Download is available for review; expert approval is pending.';
  }
  return 'Download is available from the expert-approved dataset.';
};

const lifecycleAfterStatusChange = (
  dataset: Dataset,
  status: DatasetStatus,
): Dataset['lifecycle'] => {
  if (!dataset.lifecycle) return dataset.lifecycle;

  const canonicalStatus = toExpertSelectStatus(status);
  const downloadAvailable = isDatasetStatusDownloadable(status) && hasReviewReadyFiles(dataset);

  return {
    ...dataset.lifecycle,
    state: canonicalStatus,
    upload: {
      ...dataset.lifecycle.upload,
      uploaded: canonicalStatus !== 'pending_upload',
      scanning: canonicalStatus === 'scanning',
      quarantined: canonicalStatus === 'quarantined',
    },
    review: {
      ...dataset.lifecycle.review,
      ready: canonicalStatus === 'pending_review',
      approved: canonicalStatus === 'approved' || canonicalStatus === 'published',
      rejected: canonicalStatus === 'rejected',
      published: canonicalStatus === 'published',
    },
    download: {
      ...dataset.lifecycle.download,
      available: downloadAvailable,
      review_only: downloadAvailable && canonicalStatus === 'pending_review',
      final_approved:
        downloadAvailable && (canonicalStatus === 'approved' || canonicalStatus === 'published'),
      message: downloadMessageForStatus(canonicalStatus, downloadAvailable),
    },
  };
};

const EXPERT_STATUS_TRANSITIONS: Partial<Record<DatasetStatus, DatasetStatus[]>> = {
  pending_upload: ['scanning', 'integration_failed'],
  uploaded: ['scanning', 'integration_failed'],
  scanning: ['pending_review', 'integration_failed'],
  pending_review: ['scanning', 'approved', 'rejected', 'integration_failed'],
  approved: ['scanning', 'published', 'rejected', 'integration_failed'],
  integration_failed: ['pending_review', 'rejected'],
  quarantined: ['rejected'],
  rejected: ['pending_review'],
  published: ['scanning', 'integration_failed'],
};

const getExpertStatusLabel = (status: DatasetStatus) => STATUS_CONFIG[status]?.label || status;

const getExpertStatusTransitions = (dataset: Dataset): DatasetStatus[] => {
  const current = toExpertSelectStatus(dataset.status);
  if (current === 'rejected' && !canReopenRejectedDataset(dataset)) return [];

  const transitions = EXPERT_STATUS_TRANSITIONS[current] || [];
  if (!hasReviewReadyFiles(dataset)) return transitions;

  return transitions.filter((status) => status !== 'scanning');
};

const getExpertStatusOptions = (dataset: Dataset): DatasetStatus[] => {
  const current = toExpertSelectStatus(dataset.status);
  const transitions = getExpertStatusTransitions(dataset);
  return [current, ...transitions].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
};

const canChangeExpertStatus = (dataset: Dataset): boolean =>
  getExpertStatusOptions(dataset).length > 1;

export const MyDatasetsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading: userLoading, isError: userError } = useUserContext();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [datasetPendingDelete, setDatasetPendingDelete] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [downloadingDatasetId, setDownloadingDatasetId] = useState<string | null>(null);

  useEffect(() => {
    // Wait until the user context has finished resolving
    if (userLoading) return;

    // TODO: Refactor data fetching to Tanstack query
    async function fetchDatasets() {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setStatusUpdateError(null);
      setDownloadError(null);
      DatasetService.listDatasets()
        .then((backendDatasets) => setDatasets(backendDatasets.map(toFrontendDataset)))
        .catch(() => setError('Failed to load datasets. Please try again later.'))
        .finally(() => setLoading(false));
    }
    void fetchDatasets();
  }, [user, userLoading]);

  if (userLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="datasets-page"
      >
        <div className="container flex min-h-[50vh] flex-col items-center justify-center">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your datasets...</p>
        </div>
      </motion.div>
    );
  }

  if (userError || !user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="datasets-page"
      >
        <div className="container">
          <div className="datasets-empty">
            <AlertCircle size={48} className="mb-4 text-primary" />
            <h2 className="heading-2">Unable to load your profile</h2>
            <p className="subheading text-center">
              Refresh the page or sign in again to view datasets.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  const handleMetadataConfiguration = (datasetId: string) => {
    navigate('/metadata', { state: { datasetId: datasetId } });
  };

  const handleDelete = (dataset: Dataset) => {
    setDatasetPendingDelete(dataset);
  };

  const confirmDeleteDataset = () => {
    if (!datasetPendingDelete) return;

    const id = datasetPendingDelete.id;
    setDatasetPendingDelete(null);
    setDeleting(id);
    DatasetService.deleteDataset(id)
      .then(() => setDatasets((cur) => cur.filter((ds) => ds.id !== id)))
      .catch(() => setError('Failed to delete dataset.'))
      .finally(() => setDeleting(null));
  };

  const isExpert = user.role === 'expert';
  const handleDownload = async (dataset: Dataset) => {
    if (downloadingDatasetId) return;

    setDownloadingDatasetId(dataset.id);
    setDownloadError(null);
    try {
      const { blob, filename } = await DatasetService.downloadDataset(dataset.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(getActionErrorMessage(error, 'Failed to download dataset.'));
    } finally {
      setDownloadingDatasetId(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: DatasetStatus) => {
    if (!isExpert) return;
    const dataset = datasets.find((ds) => ds.id === id);
    if (!dataset) return;
    const previous = dataset.status;
    if (previous === newStatus) return;
    if (!getExpertStatusOptions(dataset).includes(newStatus)) return;

    setUpdatingStatusId(id);
    setStatusUpdateError(null);
    setDownloadError(null);
    setDatasets((cur) =>
      cur.map((ds) =>
        ds.id === id
          ? { ...ds, status: newStatus, lifecycle: lifecycleAfterStatusChange(ds, newStatus) }
          : ds,
      ),
    );
    try {
      await DatasetService.updateStatus(id, newStatus);
    } catch (error) {
      setDatasets((cur) => cur.map((ds) => (ds.id === id ? { ...ds, status: previous } : ds)));
      setStatusUpdateError(getActionErrorMessage(error, 'Failed to update dataset status.'));
    } finally {
      setUpdatingStatusId(null);
    }
  };
  const actionError = statusUpdateError || downloadError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="datasets-page"
    >
      <div className="container">
        {/* Header */}
        <div className="datasets-header">
          <div className="mb-1">
            <h1 className="heading-1">{isExpert ? 'All User Datasets' : 'My Datasets'}</h1>
          </div>
          <p className="subheading" style={{ maxWidth: '600px' }}>
            {isExpert
              ? 'Expert View: Review global uploads, change processing states, and download files.'
              : 'View and manage the datasets you have uploaded. Track their processing status here.'}
          </p>
          {isExpert && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800">
              <CheckCircle2 size={12} /> Expert mode active
            </div>
          )}
        </div>

        {actionError && !loading && !error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle size={15} />
            <span>{actionError}</span>
          </div>
        )}

        {loading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="datasets-empty">
            <Loader2 size={32} className="animate-spin mb-4 text-primary" />
            <p className="subheading">Loading datasets…</p>
          </motion.div>
        ) : error ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="datasets-empty">
            <AlertCircle size={32} className="mb-4 text-destructive" />
            <p className="subheading">{error}</p>
          </motion.div>
        ) : datasets.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="datasets-empty">
            <div className="empty-icon">
              <Database size={32} />
            </div>
            <h2 className="empty-title">No datasets found</h2>
            <p className="empty-description">
              {isExpert
                ? 'No users have uploaded datasets yet.'
                : "You haven't uploaded any datasets yet."}
            </p>
          </motion.div>
        ) : (
          <div className="datasets-grid">
            {datasets.map((dataset) => {
              const canDownloadDataset =
                isDatasetStatusDownloadable(dataset.status) &&
                Boolean(dataset.lifecycle?.download.available);
              const isDownloading = downloadingDatasetId === dataset.id;
              const expertStatusValue = toExpertSelectStatus(dataset.status);
              const expertStatusOptions = getExpertStatusOptions(dataset);
              const expertStatusLabel = getExpertStatusLabel(expertStatusValue);
              const statusCanChange = canChangeExpertStatus(dataset);

              return (
                <div key={dataset.id} className="h-full">
                  <Card className="flex flex-col h-full group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 border-border/70">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-primary bg-primary/10 group-hover:bg-primary/15 transition-colors shrink-0">
                          <Database size={19} />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="dataset-date flex items-center gap-1">
                            <Calendar size={11} />
                            {dataset.date}
                          </span>
                          {deleting === dataset.id ? (
                            <Button variant="outline" size="xs" disabled>
                              <Loader2 size={12} className="animate-spin mr-2" />
                              Deleting...
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDelete(dataset);
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={(e) => {
                              e.preventDefault();
                              handleMetadataConfiguration(dataset.id);
                            }}
                          >
                            <FileText size={12} /> Configure Metadata
                          </Button>
                          {canDownloadDataset && (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={isDownloading}
                              onClick={async (e) => {
                                e.preventDefault();
                                await handleDownload(dataset);
                              }}
                            >
                              {isDownloading ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Download size={12} />
                              )}
                              {isDownloading ? 'Downloading...' : 'Download'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 gap-2">
                      <Link
                        to={`/datasets/${dataset.id}`}
                        className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <h3 className="dataset-title">{dataset.title}</h3>
                        <p className="dataset-description">{dataset.description}</p>

                        {dataset.metrics && (
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <FileText size={12} />
                              {dataset.metrics.instances.toLocaleString()} rows
                            </span>
                            <span className="flex items-center gap-1">
                              <Database size={12} />
                              {dataset.metrics.features} cols
                            </span>
                          </div>
                        )}
                      </Link>

                      <div className="mt-auto pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
                        <StatusBadge status={dataset.status} />
                        {isExpert && (
                          <Select
                            value={expertStatusValue}
                            onValueChange={(val) =>
                              handleStatusChange(dataset.id, val as DatasetStatus)
                            }
                          >
                            <SelectTrigger
                              aria-label={expertStatusLabel}
                              className="h-8 w-[210px] max-w-full justify-between text-xs"
                              disabled={updatingStatusId === dataset.id || !statusCanChange}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="min-w-[210px]">
                              {expertStatusOptions.map((status) => (
                                <SelectItem
                                  key={status}
                                  value={status}
                                  disabled={status === expertStatusValue}
                                >
                                  {getExpertStatusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        <ConfirmationDialog
          open={Boolean(datasetPendingDelete)}
          title="Delete dataset"
          description={
            datasetPendingDelete
              ? `Delete "${datasetPendingDelete.title}"? This cannot be undone.`
              : 'Delete this dataset? This cannot be undone.'
          }
          confirmLabel="Delete dataset"
          tone="destructive"
          onCancel={() => setDatasetPendingDelete(null)}
          onConfirm={confirmDeleteDataset}
        />
      </div>
    </motion.div>
  );
};
