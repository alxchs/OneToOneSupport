!macro customInstall
  DetailPrint "Configurando regra de firewall para OneToOneSupport no perfil Privado..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="OneToOneSupport" dir=in action=allow program="$INSTDIR\OneToOneSupport.exe" profile=private enable=yes'
!macroend

!macro customUnInstall
  DetailPrint "Removendo regra de firewall do OneToOneSupport..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OneToOneSupport"'
!macroend
