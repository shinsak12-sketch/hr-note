Attribute VB_Name = "App"
Option Explicit

' ===== 공통: 상수, 작업 상태, 메시지, 이동, 보호, 이력 =====

Public Const APP_NAME As String = "사업비 관리"
Public Const APP_VER As String = "0.1 테스트"

Public Const PLAN_FIRST As Long = 8
Public Const PLAN_LAST As Long = 600
Public Const PC_LAST As Long = 41      ' 사업비계획 데이터 열 (A~AO)
Public Const PC_TYPE As Long = 42      ' 행 구분 열 AP (D=계정, S=소계, T=합계)

Public Const COMP_FIRST As Long = 17
Public Const COMP_LAST As Long = 609
Public Const CC_LAST As Long = 17
Public Const CC_TYPE As Long = 16      ' 행 구분 열 P

Public Const LED_FIRST As Long = 7
Public Const LED_LAST As Long = 20006
Public Const ACCT_FIRST As Long = 7
Public Const ACCT_LAST As Long = 306
Public Const LOG_LAST As Long = 5000

Public Const TPL_PLAN_ROW As Long = 700 ' SYS 시트의 계획 수식 견본 행
Public Const TPL_COMP_ROW As Long = 702 ' SYS 시트의 계획대비실적 수식 견본 행

Private mDepth As Long

Public Sub BeginWork()
    If mDepth = 0 Then
        Application.ScreenUpdating = False
        Application.EnableEvents = False
        Application.Calculation = xlCalculationManual
    End If
    mDepth = mDepth + 1
End Sub

Public Sub EndWork(Optional ByVal force As Boolean = False)
    If force Then
        mDepth = 0
    ElseIf mDepth > 0 Then
        mDepth = mDepth - 1
    End If
    If mDepth = 0 Then
        Application.Calculation = xlCalculationAutomatic
        Application.EnableEvents = True
        Application.ScreenUpdating = True
    End If
End Sub

' SYS!B7 = 1 개발(저장 허용), 2 자동 점검(메시지 창 없이 진행)
Public Function TestMode() As Boolean
    TestMode = (Val(shSys.Range("B7").Value) = 2)
End Function

Public Sub Info(ByVal msg As String)
    If TestMode() Then
        shSys.Range("B8").Value = msg
        Exit Sub
    End If
    MsgBox msg, vbInformation, APP_NAME
End Sub

Public Sub Warn(ByVal msg As String)
    If TestMode() Then
        shSys.Range("B8").Value = "!" & msg
        Exit Sub
    End If
    MsgBox msg, vbExclamation, APP_NAME
End Sub

Public Function Ask(ByVal msg As String, Optional ByVal buttons As Long = 4) As Long   ' 4 = vbYesNo
    If TestMode() Then
        Ask = vbYes
        Exit Function
    End If
    Ask = MsgBox(msg, buttons + vbQuestion, APP_NAME)
End Function

' 숫자 입력 창. 취소하면 False
Public Function AskNumber(ByVal prompt As String, ByVal defaultValue As Variant) As Variant
    If TestMode() Then
        AskNumber = shSys.Range("B9").Value
        Exit Function
    End If
    AskNumber = Application.InputBox(prompt, APP_NAME, defaultValue, Type:=1)
End Function

' 날짜·시각 문자열 (Format 서식 차이에 영향받지 않게 직접 조립)
Public Function Stamp(Optional ByVal forFile As Boolean = False, Optional ByVal when As Variant) As String
    Dim t As Date
    If IsMissing(when) Then
        t = Now
    Else
        t = CDate(when)
    End If
    If forFile Then
        Stamp = Year(t) & P2(Month(t)) & P2(Day(t)) & "_" & P2(Hour(t)) & P2(Minute(t)) & P2(Second(t))
    Else
        Stamp = Year(t) & "-" & P2(Month(t)) & "-" & P2(Day(t)) & " " & P2(Hour(t)) & ":" & P2(Minute(t)) & ":" & P2(Second(t))
    End If
End Function

Private Function P2(ByVal v As Long) As String
    P2 = Right("0" & v, 2)
End Function

Public Function CurrentUser() As String
    Dim u As String
    On Error Resume Next
    u = Application.UserName
    If Len(u) = 0 Then u = Environ("USERNAME")
    CurrentUser = u
End Function

Public Sub MarkDirty()
    If shSys.Range("B4").Value <> True Then shSys.Range("B4").Value = True
End Sub

Public Function IsDirty() As Boolean
    IsDirty = (shSys.Range("B4").Value = True)
End Function

Public Function LoadedYear() As Long
    LoadedYear = Val(shSys.Range("B2").Value)
End Function

Public Function RequireYear() As Boolean
    Dim ok As Boolean
    ok = (LoadedYear() > 0)
    If Not ok Then Warn "열려 있는 연도 데이터가 없습니다." & vbCrLf & "[홈]에서 연도를 열거나 [새 연도 만들기]를 누르세요."
    RequireYear = ok
End Function

Public Sub AddLog(ByVal what As String)
    Dim r As Long
    r = 2 + LogCount()
    If r > LOG_LAST Then Exit Sub
    shLog.Cells(r, 1).Value = Stamp()
    shLog.Cells(r, 2).Value = CurrentUser()
    shLog.Cells(r, 3).Value = what
End Sub

Public Function LogCount() As Long
    LogCount = Application.WorksheetFunction.CountA(shLog.Range(shLog.Cells(2, 1), shLog.Cells(LOG_LAST, 1)))
End Function

Public Sub ProtectAll()
    Dim ws As Worksheet
    If TestMode() Then Exit Sub   ' 자동 점검 환경은 UserInterfaceOnly 를 지원하지 않음
    On Error Resume Next
    For Each ws In ThisWorkbook.Worksheets
        ws.Protect Password:="", DrawingObjects:=True, Contents:=True, Scenarios:=True, _
            UserInterfaceOnly:=True, AllowFormattingColumns:=True, AllowFormattingRows:=True, _
            AllowFiltering:=True
        ws.EnableOutlining = True
    Next ws
End Sub

' ----- 시작 -----
Public Sub Startup()
    On Error GoTo Fail
    ProtectAll
    shHome.Range("B5").Value = ""
    If LCase(Left(ThisWorkbook.Path, 4)) = "http" Then
        Warn "OneDrive/SharePoint 웹 경로에서 열려 있습니다." & vbCrLf & "폴더째 내 PC로 옮긴 뒤 다시 여세요."
        Exit Sub
    End If
    EnsureFolders
    RefreshYearList
    If LatestYear() > 0 Then
        LoadYear LatestYear()
    Else
        ClearAll
    End If
    ShowSheet shHome
    ThisWorkbook.Saved = True
    Exit Sub
Fail:
    EndWork True
    Warn "시작하는 중 문제가 생겼습니다." & vbCrLf & Err.Description
End Sub

' ----- 화면 이동 (상단 메뉴 버튼) -----
Public Sub GoHome()
    ShowSheet shHome
End Sub

Public Sub GoPlan()
    ShowSheet shPlan
End Sub

Public Sub GoInput()
    ShowSheet shInput
    On Error Resume Next
    shInput.Range("C8").Select
End Sub

Public Sub GoComp()
    ShowSheet shComp
End Sub

Public Sub GoLedger()
    ShowSheet shLedger
End Sub

Public Sub GoAcct()
    ShowSheet shAcct
End Sub

Private Sub ShowSheet(ByVal ws As Worksheet)
    On Error Resume Next
    ws.Activate
    ActiveWindow.ScrollRow = 1
    ActiveWindow.ScrollColumn = 1
End Sub
