"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/core/ui/card';
import { Button } from '@/core/ui/button';
import { GlassInput } from "@/components/ui/glass-input"
import { Textarea } from "@/core/ui/textarea"
import { Label } from "@/core/ui/label"
import { Loader2, Mail, CheckCircle } from "lucide-react"
import { useMutation } from "@/core/hooks/useApi"

export default function EmailExamplePage() {
    const [to, setTo] = useState("")
    const [subject, setSubject] = useState("")
    const [html, setHtml] = useState("")

    const { mutate, loading, error, data } = useMutation<{ to: string; subject: string; html: string }, { message: string }>("POST", "/core/email")

    const handleSend = async () => {
        if (!to || !subject || !html) return
        await mutate({ to, subject, html })
    }

    const success = data?.message

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 className="text-lg font-semibold md:text-2xl">Exemplo de Email</h1>
                <p className="text-sm text-muted-foreground mt-1">Demonstração do serviço de envio de emails (Nodemailer)</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Formulário de Email
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <GlassInput
                                id="to"
                                label="Destinatário"
                                type="email"
                                placeholder="usuario@exemplo.com"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                icon={<Mail className="w-4 h-4" />}
                            />
                        </div>

                        <div>
                            <GlassInput id="subject" label="Assunto" type="text" placeholder="Assunto do email" value={subject} onChange={(e) => setSubject(e.target.value)} />
                        </div>

                        <div>
                            <Label htmlFor="html">Conteúdo HTML</Label>
                            <Textarea
                                id="html"
                                placeholder="<h1>Olá!</h1><p>Este é um email de teste.</p>"
                                value={html}
                                onChange={(e) => setHtml(e.target.value)}
                                rows={8}
                                className="mt-2 font-mono text-sm"
                            />
                        </div>

                        <Button onClick={handleSend} disabled={loading || !to || !subject || !html} className="w-full">
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <Mail className="mr-2 h-4 w-4" />
                                    Enviar Email
                                </>
                            )}
                        </Button>

                        {error && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        {success && (
                            <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-primary" />
                                    <p className="text-sm font-medium text-primary">{success}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Preview do HTML</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!html && (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>Digite o HTML para ver o preview</p>
                            </div>
                        )}

                        {html && <div className="p-4 border rounded-md bg-background" dangerouslySetInnerHTML={{ __html: html }} />}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Exemplos de HTML</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button variant="outline" size="sm" onClick={() => setHtml('<h1 style="color: #22c55e;">Bem-vindo!</h1><p>Este é um email de boas-vindas.</p>')}>
                        Exemplo 1: Boas-vindas
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setHtml(
                                '<div style="font-family: Arial, sans-serif;"><h2>Olá!</h2><p>Você tem uma nova notificação.</p><a href="#" style="display: inline-block; padding: 10px 20px; background-color: #22c55e; color: white; text-decoration: none; border-radius: 5px;">Ver Notificação</a></div>',
                            )
                        }
                    >
                        Exemplo 2: Notificação
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setHtml(
                                '<table style="width: 100%; max-width: 600px; margin: 0 auto; border: 1px solid #ddd;"><tr><td style="padding: 20px; background-color: #f9f9f9;"><h2>Relatório Mensal</h2><p>Seu relatório está pronto.</p></td></tr></table>',
                            )
                        }
                    >
                        Exemplo 3: Relatório
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Sobre este Exemplo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Este exemplo demonstra o uso do serviço de email centralizado.</p>
                    <p>
                        <strong>Serviço:</strong> <code className="bg-muted px-1 rounded">@/core/email/mailer</code>
                    </p>
                    <p>
                        <strong>API:</strong> <code className="bg-muted px-1 rounded">POST /api/core/email</code>
                    </p>
                    <p>
                        <strong>Provedor:</strong> Nodemailer (configurável via SMTP)
                    </p>
                    <p className="text-xs">Se o SMTP não estiver configurado, o email será "mockado" (apenas log no console).</p>
                </CardContent>
            </Card>
        </div>
    )
}
