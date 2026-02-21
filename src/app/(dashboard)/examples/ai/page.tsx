"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
import { Button } from '@/core/ui/button';
import { Textarea } from '@/core/ui/textarea';
import { Label } from '@/core/ui/label';
import { Loader2, Sparkles } from 'lucide-react';
import { useMutation } from '@/core/hooks/useApi';

export default function AIExamplePage() {
  const [prompt, setPrompt] = useState('');
  const { mutate, loading, error, data } = useMutation<
    { prompt: string },
    { text: string }
  >('POST', '/core/ai');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await mutate({ prompt });
  };

  return (
      <div className="flex flex-col gap-4">
          <div>
              <h1 className="text-lg font-semibold md:text-2xl">Exemplo de IA</h1>
              <p className="text-sm text-muted-foreground mt-1">Demonstração do serviço de IA (Google Gemini)</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
              <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5" />
                          Prompt
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div>
                          <Label htmlFor="prompt">Digite seu prompt</Label>
                          <Textarea
                              id="prompt"
                              placeholder="Ex: Explique o que é Next.js em 3 linhas"
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              rows={6}
                              className="mt-2"
                          />
                      </div>

                      <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="w-full">
                          {loading ? (
                              <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Gerando...
                              </>
                          ) : (
                              <>
                                  <Sparkles className="mr-2 h-4 w-4" />
                                  Gerar Texto
                              </>
                          )}
                      </Button>

                      {error && (
                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                              <p className="text-sm text-destructive">{error}</p>
                          </div>
                      )}
                  </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                      <CardTitle>Resposta</CardTitle>
                  </CardHeader>
                  <CardContent>
                      {loading && (
                          <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                      )}

                      {!loading && !data && !error && (
                          <div className="text-center py-8 text-muted-foreground">
                              <p>Digite um prompt e clique em &quot;Gerar Texto&quot;</p>
                          </div>
                      )}

                      {data && (
                          <div className="prose prose-sm max-w-none">
                              <p className="whitespace-pre-wrap">{data.text}</p>
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
                  <p>Este exemplo demonstra o uso do serviço de IA centralizado do core.</p>
                  <p>
                      <strong>Serviço:</strong> <code className="bg-muted px-1 rounded">@/core/ai/genai</code>
                  </p>
                  <p>
                      <strong>API:</strong> <code className="bg-muted px-1 rounded">POST /api/core/ai</code>
                  </p>
                  <p>
                      <strong>Modelo:</strong> Google Gemini (gemini-2.0-flash-exp)
                  </p>
                  <p>Todos os usos são automaticamente registrados no banco de dados para controle de consumo.</p>
              </CardContent>
          </Card>
      </div>
  )
}
