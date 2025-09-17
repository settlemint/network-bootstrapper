{{/*
Expand the name of the chart.
*/}}
{{- define "nodes.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "nodes.fullname" -}}
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
{{- define "nodes.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nodes.labels" -}}
helm.sh/chart: {{ include "nodes.chart" . }}
{{ include "nodes.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "nodes.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nodes.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "nodes.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "nodes.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Render optional Log4j environment variables when structured logging is enabled.
*/}}
{{- define "nodes.log4jEnv" -}}
{{- if eq (default "plain" .Values.config.logFormat) "json" }}
- name: LOG4J_CONFIGURATION_FILE
  value: /etc/besu/log-config.xml
{{- end }}
{{- end }}

{{/*
Render optional volume mounts for the Log4j configuration file.
*/}}
{{- define "nodes.log4jVolumeMount" -}}
{{- if eq (default "plain" .Values.config.logFormat) "json" }}
- name: besu-config
  mountPath: /etc/besu/log-config.xml
  subPath: log-config.xml
  readOnly: true
{{- end }}
{{- end }}

{{/*
Resolve the number of validator replicas, falling back to global overrides when provided.
*/}}
{{- define "nodes.validatorReplicaCount" -}}
{{- $explicit := .Values.validatorReplicaCount -}}
{{- if not (empty $explicit) -}}
{{- $explicit | int -}}
{{- else -}}
{{- $global := default (dict) .Values.global -}}
{{- $networkGlobal := dict -}}
{{- if and (kindIs "map" $global) (hasKey $global "network") -}}
  {{- $networkCandidate := index $global "network" -}}
  {{- if kindIs "map" $networkCandidate -}}
    {{- $networkGlobal = $networkCandidate -}}
  {{- end -}}
{{- end -}}
{{- if and (kindIs "map" $networkGlobal) (hasKey $networkGlobal "validatorReplicaCount") -}}
{{- (index $networkGlobal "validatorReplicaCount") | int -}}
{{- else if and (kindIs "map" $global) (hasKey $global "validatorReplicaCount") -}}
{{- (index $global "validatorReplicaCount") | int -}}
{{- else -}}
4
{{- end -}}
{{- end -}}
{{- end }}
