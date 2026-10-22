Option Explicit

Private Sub Workbook_Open()
    Startup
End Sub

Private Sub Workbook_BeforeClose(Cancel As Boolean)
    Dim ans As Long
    If IsDirty() Then
        ans = MsgBox("저장하지 않은 변경이 있습니다. 저장하고 닫을까요?", vbYesNoCancel + vbQuestion, APP_NAME)
        If ans = vbCancel Then
            Cancel = True
            Exit Sub
        End If
        If ans = vbYes Then
            If Not DoSave(False) Then
                Cancel = True
                Exit Sub
            End If
        End If
    End If
    ThisWorkbook.Saved = True
End Sub

' Ctrl+S 는 프로그램 파일이 아니라 데이터 파일을 저장한다
Private Sub Workbook_BeforeSave(ByVal SaveAsUI As Boolean, Cancel As Boolean)
    If Val(shSys.Range("B7").Value) = 1 Then Exit Sub
    Cancel = True
    SaveData
End Sub
