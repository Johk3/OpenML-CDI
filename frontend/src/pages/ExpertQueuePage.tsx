import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Calendar,
  XCircle,
  Eye,
  Check,
  X,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { Dataset, DatasetStatus } from '../types/auth';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Input } from '../components/ui/input';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { BackendDataset } from '@/types/dataset';

function toFrontendDataset(b: BackendDataset): Dataset {
  const metadata = b.dataset_metadata || {};
  let description = '';
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

  return {
    id: b.id || 'no-id',
    title: b.title || 'Untitled Dataset',
    description: description || 'No description provided.',
    date: b.created_at ? b.created_at.slice(0, 10) : 'Unknown',
    status: (b.status || 'pending') as DatasetStatus,
    malwareScan: metadata.malware_scan as Dataset['malwareScan'],
  };
}

const STATUS_CONFIG: Record<DatasetStatus, { label: string; icon: React.ReactNode; cls: string }> =
  {
    pending: {
      label: 'Pending Review',
      icon: <Clock size={13} />,
      cls: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-700',
    },
    converted: {
      label: 'Processing',
      icon: <Loader2 size={13} className="animate-spin" />,
      cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    },
    claimed: {
      label: 'Verified',
      icon: <CheckCircle2 size={13} />,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    },
    quarantined: {
      label: 'Quarantined / Failed',
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
      icon: <XCircle size={13} />,
      cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    },
    published: {
      label: 'Published',
      icon: <Database size={13} />,
      cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

export const ExpertQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useUserContext();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<DatasetStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDatasets = () => {
    DatasetService.listDatasets({ scope: 'review_queue' })
      .then((backendDatasets) => setDatasets(backendDatasets.map(toFrontendDataset)))
      .catch(() => setError('Failed to load review queue. Please try again later.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (userLoading) return;
    if (!user || user.role !== 'expert') {
      navigate('/');
      return;
    }
    fetchDatasets();
  }, [user, userLoading, navigate]);

  const handleStatusChange = async (id: string, newStatus: DatasetStatus) => {
    const previous = datasets.find((ds) => ds.id === id)?.status;
    if (!previous || previous === newStatus) return;

    setDatasets((cur) => cur.map((ds) => (ds.id === id ? { ...ds, status: newStatus } : ds)));
    try {
      await DatasetService.updateStatus(id, newStatus);
    } catch {
      setDatasets((cur) => cur.map((ds) => (ds.id === id ? { ...ds, status: previous } : ds)));
      setError('Failed to update dataset status.');
    }
  };

  const filteredDatasets = useMemo(() => {
    return datasets.filter((ds) => {
      if (filterStatus !== 'all' && ds.status !== filterStatus) return false;
      if (searchQuery && !ds.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [datasets, filterStatus, searchQuery]);

  if (userLoading || !user || user.role !== 'expert') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="datasets-page"
    >
      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
              <ShieldAlert size={20} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Expert Review Queue</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Review and manage datasets awaiting approval. Ensure data quality, metadata integrity,
            and malware safety before publishing to the platform.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="relative w-full sm:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <Input
              placeholder="Search datasets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm font-medium whitespace-nowrap">Filter by Status:</span>
            <Select
              value={filterStatus}
              onValueChange={(val) => setFilterStatus(val as DatasetStatus | 'all')}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending Review</SelectItem>
                <SelectItem value="quarantined">Quarantined / Failed Scan</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin mb-4 text-primary" />
            <p className="text-muted-foreground font-medium">Loading queue...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle size={48} className="mb-4 text-destructive opacity-80" />
            <p className="text-lg font-semibold text-destructive">{error}</p>
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-xl border border-dashed border-border">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-xl font-bold mb-2">You're all caught up!</h2>
            <p className="text-muted-foreground max-w-md">
              There are no datasets matching the current filters. Check back later for new
              submissions.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredDatasets.map((dataset) => {
              const malwareScan = dataset.malwareScan;
              const isQuarantined = dataset.status === 'quarantined';
              const hasMalwareIssue =
                malwareScan &&
                malwareScan.files?.some((f) => f.status === 'infected' || f.status === 'error');
              const scanSkipped =
                malwareScan && malwareScan.files?.some((f) => f.message?.includes('unavailable'));

              return (
                <Card
                  key={dataset.id}
                  className="overflow-hidden transition-all duration-200 hover:shadow-md border-border/80"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="p-5 flex-1 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-foreground hover:text-primary transition-colors">
                            <Link to={`/datasets/${dataset.id}`}>{dataset.title}</Link>
                          </h3>
                          <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar size={13} />
                              {dataset.date}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>ID: {dataset.id.slice(0, 8)}...</span>
                          </div>
                        </div>
                        <StatusBadge status={dataset.status} />
                      </div>

                      <p className="text-sm text-foreground/80 line-clamp-2">
                        {dataset.description}
                      </p>

                      {/* Malware Scan Alerts */}
                      {(isQuarantined || hasMalwareIssue || scanSkipped) && (
                        <div
                          className={`mt-2 p-3 rounded-md border flex items-start gap-2.5 text-sm ${
                            hasMalwareIssue || isQuarantined
                              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300'
                              : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/30 dark:border-yellow-900/50 dark:text-yellow-300'
                          }`}
                        >
                          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold block mb-0.5">
                              {hasMalwareIssue || isQuarantined
                                ? 'Malware Scan Failed / Malicious Content Detected'
                                : 'Malware Scan Skipped'}
                            </span>
                            {scanSkipped &&
                              'The virus scanner was unavailable during upload. Proceed with caution.'}
                            {(hasMalwareIssue || isQuarantined) &&
                              'This dataset contains files marked as infected or resulted in a scan error.'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions sidebar */}
                    <div className="bg-muted/30 border-t sm:border-t-0 sm:border-l border-border p-4 flex sm:flex-col items-center justify-center gap-3 min-w-[160px]">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="w-full justify-start h-9"
                      >
                        <Link to={`/datasets/${dataset.id}`}>
                          <Eye size={14} className="mr-2" />
                          Inspect Details
                        </Link>
                      </Button>

                      {['pending', 'quarantined'].includes(dataset.status) && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full justify-start h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            onClick={() => handleStatusChange(dataset.id, 'approved')}
                            disabled={isQuarantined} // Cannot approve quarantined
                            title={
                              isQuarantined
                                ? 'Cannot approve quarantined datasets'
                                : 'Approve dataset'
                            }
                          >
                            <Check size={14} className="mr-2" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full justify-start h-9 shadow-sm"
                            onClick={() => handleStatusChange(dataset.id, 'rejected')}
                          >
                            <X size={14} className="mr-2" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};
