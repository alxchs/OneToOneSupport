!macro customInstall
  DetailPrint "Configurando regra de firewall para OneToOneSupport no perfil Privado..."
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="OneToOneSupport" dir=in action=allow program="$INSTDIR\OneToOneSupport.exe" profile=private enable=yes'
  Pop $0
  ${If} $0 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Nao foi possivel criar a regra do Firewall do Windows (codigo $0). O celular pode nao conseguir conectar; o Windows pedira permissao na primeira sessao." /SD IDOK
  ${EndIf}
!macroend

!macro customUnInstall
  DetailPrint "Removendo regra de firewall do OneToOneSupport..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="OneToOneSupport"'
  Pop $0
!macroend
