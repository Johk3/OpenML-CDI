import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Database,
  FileText,
  Users,
  Calendar,
  Shield,
  MessageSquare,
  Link as LinkIcon,
  Loader2,
  AlertCircle,
  User as UserIcon,
  Mail,
  FileCode,
  Download,
  ChevronDown,
  ChevronUp,
  FileJson,
  ExternalLink,
} from 'lucide-react';
import {
  CroissantDistribution,
  CroissantMetadata,
  Dataset,
  DatasetStatus,
  MalwareScan,
} from '../types/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { BackendDataset } from '@/types/dataset';

type UploadRepresentation = 'single_object' | 'multi_object' | 'zip';

interface UploadDirectoryStructure {
  compressed: boolean;
  representation: UploadRepresentation;
  root: string | null;
  paths: string[];
  archive_path?: string | null;
  manifest: {
    version: number;
    path_count: number;
    source: string;
  };
}

type BackendDatasetWithPackage = BackendDataset & {
  upload_package?: UploadDirectoryStructure;
};

type DatasetWithUploadPackage = Dataset & {
  uploadPackage?: UploadDirectoryStructure;
};

function parseDistribution(value: unknown): CroissantDistribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        name: typeof obj.name === 'string' ? obj.name : undefined,
        description: typeof obj.description === 'string' ? obj.description : undefined,
        contentUrl: typeof obj.contentUrl === 'string' ? obj.contentUrl : undefined,
        encodingFormat: typeof obj.encodingFormat === 'string' ? obj.encodingFormat : undefined,
        sha256: typeof obj.sha256 === 'string' ? obj.sha256 : undefined,
        md5: typeof obj.md5 === 'string' ? obj.md5 : undefined,
        contentSize:
          typeof obj.contentSize === 'string' || typeof obj.contentSize === 'number'
            ? String(obj.contentSize)
            : undefined,
      };
    });
}

function parseUploadPackage(value: unknown): UploadDirectoryStructure | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.paths) || obj.paths.some((path) => typeof path !== 'string')) {
    return undefined;
  }

  const representation =
    obj.representation === 'zip' ||
    obj.representation === 'multi_object' ||
    obj.representation === 'single_object'
      ? obj.representation
      : obj.compressed
        ? 'zip'
        : obj.paths.length > 1
          ? 'multi_object'
          : 'single_object';

  const manifest =
    typeof obj.manifest === 'object' && obj.manifest !== null
      ? (obj.manifest as Record<string, unknown>)
      : {};

  return {
    compressed: Boolean(obj.compressed),
    representation,
    root: typeof obj.root === 'string' ? obj.root : null,
    paths: obj.paths as string[],
    archive_path: typeof obj.archive_path === 'string' ? obj.archive_path : null,
    manifest: {
      version: typeof manifest.version === 'number' ? manifest.version : 1,
      path_count: typeof manifest.path_count === 'number' ? manifest.path_count : obj.paths.length,
      source: typeof manifest.source === 'string' ? manifest.source : 'directory_structure.paths',
    },
  };
}

function toFrontendDataset(b: BackendDatasetWithPackage): DatasetWithUploadPackage {
  const metadata = b.dataset_metadata || {};
  const uploadPackage = parseUploadPackage(b.upload_package ?? metadata.directory_structure);
  let description = '';
  let contact: Dataset['contact'];
  let metrics: Dataset['metrics'];

  const descriptionValue = metadata.description;
  if (typeof descriptionValue === 'string') {
    description = descriptionValue;
  } else if (
    typeof descriptionValue === 'object' &&
    descriptionValue !== null &&
    typeof (descriptionValue as { text?: unknown }).text === 'string'
  ) {
    description = (descriptionValue as { text: string }).text;
    const contactValue = (descriptionValue as { contact?: unknown }).contact;
    if (
      typeof contactValue === 'object' &&
      contactValue !== null &&
      typeof (contactValue as { first_name?: unknown }).first_name === 'string' &&
      typeof (contactValue as { last_name?: unknown }).last_name === 'string' &&
      typeof (contactValue as { email?: unknown }).email === 'string'
    ) {
      contact = contactValue as Dataset['contact'];
    }
  }

  // Detect Croissant Metadata
  let croissant: CroissantMetadata | undefined = undefined;
  if (metadata.conformsTo || metadata['@type'] === 'sc:Dataset' || metadata['@context']) {
    const creatorValue = metadata.creator;
    const contributors =
      Array.isArray(creatorValue) && creatorValue.length > 0
        ? creatorValue.map((c) =>
            typeof c === 'string' ? c : (c as { name?: string }).name || 'Unknown',
          )
        : [];
    croissant = {
      title: (metadata.name as string) || (metadata.title as string) || b.title,
      description: (metadata.description as string) || description,
      license: (metadata.license as string) || 'Unspecified',
      contributors,
      variables: [], // Simplified for now
      url: (metadata.url as string) || undefined,
      distribution: parseDistribution(metadata.distribution),
    };
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

  return {
    id: b.id || 'no-id',
    title: b.title || 'Untitled Dataset',
    description: description || 'No description provided.',
    date: b.created_at ? b.created_at.slice(0, 10) : 'Unknown',
    status: (b.status || 'pending') as DatasetStatus,
    metrics,
    croissantMetadata: croissant || (metadata.croissantMetadata as CroissantMetadata | undefined),
    files: uploadPackage?.paths ?? (metadata.filenames as string[]),
    uploadPackage,
    contact: contact,
    malwareScan: metadata.malware_scan as MalwareScan,
    rawMetadata: b.dataset_metadata,
  };
}

export const DatasetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUserContext();

  const [dataset, setDataset] = useState<DatasetWithUploadPackage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllFiles, setShowAllFiles] = useState(false);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const loadDataset = async () => {
      await Promise.resolve();
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        const data = (await DatasetService.getDataset(id)) as BackendDatasetWithPackage;
        if (isMounted) setDataset(toFrontendDataset(data));
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Dataset not found.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDataset();

    return () => {
      isMounted = false;
    };
  }, [id]);

  type GitHubComment = {
    id: number;
    author: string;
    avatar_url: string;
    body: string;
    created_at: string;
    author_association: string;
  };
  type DiscussionData = {
    state: string;
    html_url: string;
    comments: GitHubComment[];
  };

  const [discussion, setDiscussion] = useState<DiscussionData | null>(null);
  const [discussionLoading, setDiscussionLoading] = useState(true);

  const fetchDiscussion = useCallback(async () => {
    if (!id) return;
    try {
      const data = await DatasetService.getGitHubDiscussion(id);
      setDiscussion(data);
    } catch (Error) {
      // Dont display an error to user
      console.log(Error);
    } finally {
      setDiscussionLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiscussion();
    const interval = setInterval(fetchDiscussion, 30_000);
    return () => clearInterval(interval);
  }, [fetchDiscussion]);

  const timeAgo = (iso: string) => {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (!user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="container py-12">
        <div className="flex flex-col items-center justify-center p-12 bg-card border rounded-2xl shadow-sm">
          <AlertCircle size={48} className="mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-6">Please login to view dataset details.</p>
          <Button onClick={() => navigate('/login')}>Go to Login</Button>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground animate-pulse">Loading dataset details...</p>
      </div>
    );
  }

  if (error || !dataset) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="container py-12"
      >
        <Button variant="ghost" className="mb-6 -ml-4" onClick={() => navigate('/datasets')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Datasets
        </Button>
        <div className="flex flex-col items-center justify-center p-12 bg-destructive/5 border border-destructive/20 rounded-2xl">
          <AlertCircle size={48} className="mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Error Loading Dataset</h2>
          <p className="text-muted-foreground">{error || 'Dataset not found.'}</p>
        </div>
      </motion.div>
    );
  }

  const { croissantMetadata } = dataset;
  const statusLabel: Record<DatasetStatus, string> = {
    pending: 'Pending Expert Review',
    converted: 'Ongoing Processing',
    claimed: 'Verified & Published',
    quarantined: 'Processing Error',
    approved: 'Approved',
    rejected: 'Rejected',
    published: 'Published',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="container py-8 max-w-5xl"
    >
      <Button
        variant="ghost"
        className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
        onClick={() => navigate('/datasets')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Datasets
      </Button>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{dataset.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {dataset.date}
                </span>
                {dataset.metrics && (
                  <>
                    <span className="flex items-center gap-1">
                      <FileText size={14} /> {dataset.metrics.instances.toLocaleString()} rows
                    </span>
                    <span className="flex items-center gap-1">
                      <Database size={14} /> {dataset.metrics.features} features
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 shrink-0">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary border border-primary/20">
            {statusLabel[dataset.status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3 border-b pb-2">Description</h2>
            <p className="text-muted-foreground leading-relaxed">{dataset.description}</p>
          </section>

          {croissantMetadata && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" /> Croissant Metadata
                </h2>
                {dataset.rawMetadata && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      const jsonString = JSON.stringify(dataset.rawMetadata, null, 2);
                      const blob = new Blob([jsonString], { type: 'application/json' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${dataset.title.replace(/\s+/g, '_').toLowerCase()}_croissant.json`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    }}
                  >
                    <FileJson size={14} /> Download Croissant
                  </Button>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="font-medium text-foreground mb-1">Croissant Title</h3>
                  <p className="text-sm text-muted-foreground">{croissantMetadata.title}</p>
                </div>

                <div>
                  <h3 className="font-medium text-foreground mb-1">Croissant Description</h3>
                  <p className="text-sm text-muted-foreground">{croissantMetadata.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-muted/30 p-4 rounded-lg border">
                    <h3 className="font-medium flex items-center gap-2 mb-2 text-sm">
                      <Users className="w-4 h-4 text-muted-foreground" /> Contributors
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {croissantMetadata.contributors.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg border">
                    <h3 className="font-medium flex items-center gap-2 mb-2 text-sm">
                      <Shield className="w-4 h-4 text-muted-foreground" /> License & Info
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>
                        <span className="font-medium text-foreground">License:</span>{' '}
                        {croissantMetadata.license}
                      </p>
                      {croissantMetadata.url && (
                        <p className="flex items-center gap-1">
                          <span className="font-medium text-foreground">URL:</span>
                          <a
                            href={croissantMetadata.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            Link <LinkIcon size={12} />
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {croissantMetadata.variables && croissantMetadata.variables.length > 0 && (
                  <div>
                    <h3 className="font-medium text-foreground mb-3 text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> Variables (
                      {croissantMetadata.variables.length})
                    </h3>
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {croissantMetadata.variables.map((v, i) => (
                            <tr key={i} className="bg-card hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium">{v.name}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                                  {v.type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {v.description || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {croissantMetadata.distribution && croissantMetadata.distribution.length > 0 && (
                  <div>
                    <h3 className="font-medium text-foreground mb-3 text-sm flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-muted-foreground" /> Distribution (
                      {croissantMetadata.distribution.length})
                    </h3>
                    <div className="space-y-3">
                      {croissantMetadata.distribution.map((item, idx) => (
                        <div key={idx} className="rounded-lg border p-3 text-sm space-y-1">
                          <p className="font-medium">{item.name || `File ${idx + 1}`}</p>
                          {item.description && (
                            <p className="text-muted-foreground">{item.description}</p>
                          )}
                          <div className="text-muted-foreground space-y-1">
                            {item.contentUrl && (
                              <p className="flex items-center gap-1">
                                <span className="font-medium text-foreground">URL:</span>
                                <a
                                  href={item.contentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  Link <LinkIcon size={12} />
                                </a>
                              </p>
                            )}
                            {item.encodingFormat && (
                              <p>
                                <span className="font-medium text-foreground">Format:</span>{' '}
                                {item.encodingFormat}
                              </p>
                            )}
                            {item.contentSize && (
                              <p>
                                <span className="font-medium text-foreground">Size:</span>{' '}
                                {item.contentSize}
                              </p>
                            )}
                            {item.sha256 && (
                              <p className="break-all">
                                <span className="font-medium text-foreground">SHA-256:</span>{' '}
                                {item.sha256}
                              </p>
                            )}
                            {item.md5 && (
                              <p className="break-all">
                                <span className="font-medium text-foreground">MD5:</span> {item.md5}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {dataset.files && dataset.files.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4 border-b pb-2">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-primary" /> Uploaded Files (
                  {dataset.files.length})
                </h2>
                {dataset.uploadPackage && (
                  <span className="text-xs font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground">
                    {dataset.uploadPackage.representation === 'zip'
                      ? 'ZIP package'
                      : dataset.uploadPackage.representation === 'multi_object'
                        ? 'Multiple objects'
                        : 'Single object'}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    const { blob, filename } = await DatasetService.downloadDataset(dataset.id);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={14} /> Download Dataset
                </Button>
              </div>
              <div className="bg-muted/10 rounded-xl border p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(showAllFiles ? dataset.files : dataset.files.slice(0, 100)).map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/50 text-xs"
                    >
                      <div className="w-7 h-7 rounded bg-primary/5 flex items-center justify-center text-primary shrink-0">
                        <FileText size={14} />
                      </div>
                      <span className="truncate font-medium">{file}</span>
                    </div>
                  ))}
                </div>

                {dataset.files.length > 100 && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllFiles(!showAllFiles)}
                      className="text-primary hover:text-primary/80"
                    >
                      {showAllFiles ? (
                        <>
                          <ChevronUp className="mr-2 h-4 w-4" /> Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="mr-2 h-4 w-4" /> Show All (
                          {dataset.files.length - 100} more)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {dataset.contact && (
            <section>
              <h2 className="text-xl font-semibold mb-4 border-b pb-2 flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-primary" /> Submitter Info
              </h2>
              <Card className="bg-primary/[0.02] border-primary/10">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <UserIcon size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Name
                        </p>
                        <p className="font-medium">
                          {dataset.contact.first_name} {dataset.contact.last_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Mail size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Email
                        </p>
                        <p className="font-medium">{dataset.contact.email}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> GitHub Discussion
              </CardTitle>
              <CardDescription>
                {discussion && discussion.state !== 'none' ? (
                  <span className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        discussion.state === 'open'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      }`}
                    >
                      {discussion.state === 'open' ? 'Open' : 'Closed'}
                    </span>
                    <a
                      href={discussion.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-xs"
                    >
                      View on GitHub <ExternalLink size={10} />
                    </a>
                  </span>
                ) : (
                  'Issue comments from GitHub'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {discussionLoading ? (
                <div className="flex flex-col items-center py-6 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Loading discussion…</p>
                </div>
              ) : discussion && discussion.state !== 'none' && discussion.comments.length > 0 ? (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {discussion.comments.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={c.author}
                          className="w-8 h-8 rounded-full shrink-0 border"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {c.author.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 bg-muted/40 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {c.author}
                            {c.author_association === 'MEMBER' ||
                            c.author_association === 'OWNER' ? (
                              <span className="inline-flex px-1.5 py-0 rounded text-[9px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                {c.author_association === 'OWNER' ? 'Owner' : 'Member'}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {timeAgo(c.created_at)}
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No comments yet.</p>
                  {discussion && discussion.html_url && (
                    <a
                      href={discussion.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
                    >
                      Start the conversation on GitHub <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!dataset.malwareScan ? (
            <div className="p-4 rounded-xl border bg-destructive/5 border-destructive/20 text-sm shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive mb-1">Malware Scan Unavailable</p>
                  <p className="text-muted-foreground text-xs">
                    This dataset has not gone through the ClamAV malware scan. This is most likely
                    because the ClamAV service is not running or is unreachable. Proceed with
                    caution.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border bg-muted/10 text-sm space-y-4 shadow-sm">
              <div className="flex items-center gap-3 border-b pb-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold">ClamAV Malware Scan</p>
                  <p className="text-xs text-muted-foreground">
                    Scan engine: {dataset.malwareScan.engine || 'clamav'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {dataset.malwareScan.files && dataset.malwareScan.files.length > 0 ? (
                  dataset.malwareScan.files.map((file, idx) => {
                    const isSkipped =
                      file.status === 'clean' && file.message?.includes('disabled/unavailable');
                    const displayStatus = isSkipped ? 'SKIPPED' : file.status.toUpperCase();
                    const colorClass = isSkipped
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : file.status === 'clean'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : file.status === 'infected'
                          ? 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-red-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';

                    return (
                      <div key={idx} className="flex flex-col p-2 rounded-md bg-card border">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-xs truncate flex-1" title={file.file}>
                            {file.file}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${colorClass}`}
                          >
                            {displayStatus}
                          </span>
                        </div>
                        {file.message && (
                          <p
                            className={`text-[10px] mt-1 ${isSkipped ? 'text-muted-foreground' : 'text-destructive'}`}
                          >
                            {file.message}
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-xs italic">
                    No scan results found for individual files.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
