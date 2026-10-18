@echo off
title MiniGym
echo ========================================================
echo               MINIGYM - SUIVI DE POMPES
echo ========================================================
echo.
echo Ouverture de MiniGym dans votre navigateur...
echo Appuyez sur Ctrl+C dans cette fenetre pour arreter le serveur.
echo.
start http://localhost:8080
python -m http.server 8080
