#!/bin/bash
# Publica el Raspa y gana en https://vapdmraspagana.web.app (correr en Google Cloud Shell)
set -e
cd "$(dirname "$0")"
firebase hosting:sites:create vapdmraspagana --project control-vapes 2>/dev/null || true
firebase deploy --only hosting --project control-vapes --non-interactive
