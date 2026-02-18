"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
import { Button } from '@/core/ui/button';
import { Input } from '@/core/ui/input';
import { Label } from '@/core/ui/label';
import { Loader2, Upload, Download, FileIcon } from 'lucide-react';
import api from '@/core/utils/api';

export default function StorageExamplePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadResult(null);
      setDownloadUrl(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/core/storage/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        setUploadResult(response.data.data);
      } else {
        setError(response.data.error || 'Erro no upload');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const handleGetDownloadUrl = async () => {
    if (!uploadResult?.key) return;

    setDownloading(true);
    setError(null);

    try {
      const response = await api.get(`/core/storage/download?key=${uploadResult.key}`);

      if (response.data.success) {
        setDownloadUrl(response.data.data.url);
      } else {
        setError(response.data.error || 'Erro ao gerar URL');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar URL de download');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl">Exemplo de Storage</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Demonstração de upload e download de arquivos (S3/Minio)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file">Selecione um arquivo</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                className="mt-2"
              />
            </div>

            {file && (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <FileIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Fazer Upload
                </>
              )}
            </Button>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {uploadResult && (
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
                <p className="text-sm font-medium text-primary">Upload realizado com sucesso!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Key: {uploadResult.key}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download de Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!uploadResult && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Faça upload de um arquivo primeiro</p>
              </div>
            )}

            {uploadResult && !downloadUrl && (
              <Button
                onClick={handleGetDownloadUrl}
                disabled={downloading}
                className="w-full"
              >
                {downloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando URL...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Gerar URL de Download
                  </>
                )}
              </Button>
            )}

            {downloadUrl && (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-2">URL Temporária (1 hora):</p>
                  <p className="text-xs break-all font-mono">{downloadUrl}</p>
                </div>

                <Button
                  onClick={() => window.open(downloadUrl, '_blank')}
                  variant="secondary"
                  className="w-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Abrir Arquivo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sobre este Exemplo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Este exemplo demonstra o uso do serviço de storage centralizado.
          </p>
          <p>
            <strong>Serviço:</strong> <code className="bg-muted px-1 rounded">@/core/storage/s3</code>
          </p>
          <p>
            <strong>APIs:</strong>
          </p>
          <ul className="list-disc list-inside ml-4">
            <li><code className="bg-muted px-1 rounded">POST /api/core/storage/upload</code> - Upload de arquivo</li>
            <li><code className="bg-muted px-1 rounded">GET /api/core/storage/download?key=...</code> - URL de download</li>
          </ul>
          <p>
            Os arquivos são armazenados no S3/Minio configurado nas variáveis de ambiente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
