{{/*
Expand the name of the chart.
*/}}
{{- define "network-bootstrapper.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "network-bootstrapper.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "network-bootstrapper.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "network-bootstrapper.labels" -}}
helm.sh/chart: {{ include "network-bootstrapper.chart" . }}
{{ include "network-bootstrapper.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "network-bootstrapper.selectorLabels" -}}
app.kubernetes.io/name: {{ include "network-bootstrapper.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "network-bootstrapper.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "network-bootstrapper.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Render init container specifications provided via values.
Accepts either a YAML string or a list of init container maps and indents output appropriately.
*/}}
{{- define "network-bootstrapper.renderInitContainers" -}}
{{- $ctx := .context -}}
{{- $containers := .containers -}}
{{- $indent := .indent | default 2 -}}
{{- if $containers -}}
{{- if kindIs "string" $containers -}}
{{ tpl $containers $ctx | nindent $indent }}
{{- else -}}
{{ tpl (toYaml $containers) $ctx | nindent $indent }}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Resolve pod and container security contexts by layering chart values over global defaults.
*/}}
{{- define "network-bootstrapper.securityContexts" -}}
{{- $root := . -}}
{{- $globalValues := ($root.Values.global | default (dict)) -}}
{{- $globalSecurityContexts := dig "securityContexts" $globalValues (dict) -}}
{{- $pod := mergeOverwrite (deepCopy (dig "pod" $globalSecurityContexts (dict))) (default (dict) $root.Values.podSecurityContext) -}}
{{- $container := mergeOverwrite (deepCopy (dig "container" $globalSecurityContexts (dict))) (default (dict) $root.Values.securityContext) -}}
{{- dict "pod" $pod "container" $container | toYaml -}}
{{- end -}}
