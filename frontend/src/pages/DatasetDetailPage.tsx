import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { CroissantDistribution, CroissantMetadata, Dataset, DatasetStatus } from '../types/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useUserContext } from '@/hooks/useUserContext';
import { DatasetService } from '@/services/datasetService';
import { BackendDataset } from '@/types/dataset';

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

function toFrontendDataset(b: BackendDataset): Dataset {
  const metadata = b.dataset_metadata || {};
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
    files: metadata.filenames as string[],
    contact: contact,
    rawMetadata: b.dataset_metadata,
  };
}

export const DatasetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUserContext();

  const [dataset, setDataset] = useState<Dataset | null>(null);
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
        const data: BackendDataset = await DatasetService.getDataset(id);
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

  const { croissantMetadata, comments } = dataset;
  const statusLabel: Record<DatasetStatus, string> = {
    pending: 'Pending Expert Review',
    converted: 'Ongoing Processing',
    claimed: 'Verified & Published',
    quarantined: 'Processing Error',
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
                <MessageSquare className="w-4 h-4" /> Discussions
              </CardTitle>
              <CardDescription>Comments and notes from users and experts</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {comments && comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          comment.role === 'expert'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                        }`}
                      >
                        {comment.author.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span className="font-semibold text-foreground">{comment.author}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(comment.date).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No comments yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
