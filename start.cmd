@echo off
cd /d %~dp0
if not exist .env (
  copy .env.example .env
  echo Created .env from .env.example. Please edit .env before running.
)
npm install
npm start
