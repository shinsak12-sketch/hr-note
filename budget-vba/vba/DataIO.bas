Attribute VB_Name = "DataIO"
Option Explicit

' ===== 데이터 파일 (data\budget_연도.xlsx) 읽기·저장·백업·새 연도 =====

Private Const SH_INFO As String = "정보"
Private Const SH_ACCT As String = "계정"
Private Const SH_PLAN As String = "계획"
Private Const SH_LED As String = "실적"
Private Const SH_LOG As String = "이력"
Private Const BACKUP_KEEP As Long = 30
Private mStage As String

Public Function DataFolder() As String
    DataFolder = ThisWorkbook.Path & Application.PathSeparator & "data"
End Function

Public Function BackupFolder() As String
    BackupFolder = ThisWorkbook.Path & Application.PathSeparator & "backup"
End Function

Public Function YearFile(ByVal y As Long) As String
    YearFile = DataFolder() & Application.PathSeparator & "budget_" & y & ".xlsx"
End Function

Public Function FileExists(ByVal p As String) As Boolean
    On Error Resume Next
    FileExists = (Len(Dir(p)) > 0)
End Function

Public Sub EnsureFolders()
    If Len(Dir(DataFolder(), vbDirectory)) = 0 Then MkDir DataFolder()
    If Len(Dir(BackupFolder(), vbDirectory)) = 0 Then MkDir BackupFolder()
End Sub

' data 폴더의 연도 목록 → SYS!J2 아래 (최신 연도가 위)
Public Sub RefreshYearList()
    Dim f As String, ys(1 To 100) As Long, n As Long, i As Long, j As Long, t As Long, y As Long
    f = Dir(DataFolder() & Application.PathSeparator & "budget_*.xlsx")
    Do While Len(f) > 0
        y = Val(Mid(f, 8, 4))
        If y >= 2000 And y <= 2100 And n < 100 Then
            n = n + 1
            ys(n) = y
        End If
        f = Dir()
    Loop
    For i = 1 To n - 1
        For j = i + 1 To n
            If ys(j) > ys(i) Then
                t = ys(i)
                ys(i) = ys(j)
                ys(j) = t
            End If
        Next j
    Next i
    shSys.Range("J2:J101").ClearContents
    For i = 1 To n
        shSys.Cells(1 + i, 10).Value = ys(i)
    Next i
End Sub

Public Function LatestYear() As Long
    LatestYear = Val(shSys.Range("J2").Value)
End Function

Public Function LastDataRow(ByVal ws As Worksheet, ByVal col As Long) As Long
    LastDataRow = ws.Cells(ws.Rows.Count, col).End(xlUp).Row
End Function

' ----- 홈 [열기] -----
Public Sub OpenSelectedYear()
    Dim y As Long
    y = Val(shHome.Range("C12").Value)
    If y = 0 Then
        Warn "열 연도를 고르세요."
        Exit Sub
    End If
    If y = LoadedYear() And Not IsDirty() Then
        Info y & "년이 이미 열려 있습니다."
        Exit Sub
    End If
    If Not ConfirmLeave() Then Exit Sub
    If LoadYear(y) Then Info y & "년 데이터를 열었습니다."
End Sub

' 저장 안 된 변경이 있으면 물어본다. 계속해도 되면 True
Public Function ConfirmLeave() As Boolean
    Dim ans As Long
    ConfirmLeave = True
    If Not IsDirty() Then Exit Function
    ans = Ask("저장하지 않은 변경이 있습니다. 먼저 저장할까요?" & vbCrLf & "([아니요]를 누르면 변경 내용은 버립니다)", vbYesNoCancel)
    If ans = vbCancel Then
        ConfirmLeave = False
    ElseIf ans = vbYes Then
        ConfirmLeave = DoSave(False)
    End If
End Function

Public Function LoadYear(ByVal y As Long) As Boolean
    Dim p As String, wb As Workbook, plan As Variant, n As Long, ws As Worksheet, msg As String, stage As String
    p = YearFile(y)
    If Not FileExists(p) Then
        Warn y & "년 데이터 파일이 없습니다." & vbCrLf & p
        Exit Function
    End If
    On Error GoTo Fail
    stage = "파일 열기"
    BeginWork
    Set wb = Workbooks.Open(Filename:=p, ReadOnly:=True, UpdateLinks:=0, AddToMru:=False)
    stage = "내용 읽기"
    ReadInfo wb.Worksheets(SH_INFO)
    ReadAccounts wb.Worksheets(SH_ACCT)
    Set ws = wb.Worksheets(SH_PLAN)
    plan = PlanArrayFromRange(ws, 2, LastDataRow(ws, 1), 0, n)
    ReadBlock wb.Worksheets(SH_LED), 11, shLedger, LED_FIRST, 2, LED_LAST, 4
    ReadBlock wb.Worksheets(SH_LOG), 3, shLog, 2, 1, LOG_LAST, 0
    stage = "파일 닫기"
    wb.Close SaveChanges:=False
    Set wb = Nothing
    stage = "화면 그리기"
    shSys.Range("B2").Value = y
    shSys.Range("B3").Value = p
    RenderAll plan, n
    If IsEmpty(shInput.Range("C6").Value) Then shInput.Range("C6").Value = shComp.Range("C5").Value
    stage = "마무리"
    shSys.Range("B4").Value = False
    shHome.Range("C12").Value = y
    EndWork
    LoadYear = True
    Exit Function
Fail:
    msg = Err.Description
    On Error Resume Next
    If Not wb Is Nothing Then wb.Close SaveChanges:=False
    EndWork True
    Warn y & "년 데이터를 여는 중 문제가 생겼습니다. (" & stage & ")" & vbCrLf & msg
End Function

Private Sub ReadInfo(ByVal ws As Worksheet)
    Dim r As Long, k As String, v As Variant
    For r = 2 To 40
        k = Trim(CStr(ws.Cells(r, 1).Value))
        v = ws.Cells(r, 2).Value
        Select Case k
            Case "표시단위"
                If Len(CStr(v)) > 0 Then shHome.Range("C19").Value = v
            Case "반올림단위"
                If Len(CStr(v)) > 0 Then shHome.Range("C20").Value = v
            Case "반올림방식"
                If Len(CStr(v)) > 0 Then shHome.Range("C21").Value = v
            Case "기준월"
                If Val(v) >= 1 And Val(v) <= 12 Then shComp.Range("C5").Value = CLng(Val(v))
            Case "다음ID"
                shSys.Range("B6").Value = Val(v)
            Case "저장시각"
                If IsDate(v) Then
                    shSys.Range("B5").Value = Left(Stamp(False, v), 16)
                Else
                    shSys.Range("B5").Value = Left(CStr(v), 16)
                End If
        End Select
    Next r
End Sub

Private Sub ReadAccounts(ByVal ws As Worksheet)
    Dim n As Long, arr As Variant, i As Long
    shAcct.Range(shAcct.Cells(ACCT_FIRST, 2), shAcct.Cells(ACCT_LAST, 6)).ClearContents
    n = LastDataRow(ws, 1) - 1
    If n <= 0 Then Exit Sub
    If n > ACCT_LAST - ACCT_FIRST + 1 Then n = ACCT_LAST - ACCT_FIRST + 1
    arr = ws.Range(ws.Cells(2, 1), ws.Cells(n + 1, 5)).Value
    For i = 1 To n
        arr(i, 1) = Trim(CStr(arr(i, 1)))
    Next i
    shAcct.Range(shAcct.Cells(ACCT_FIRST, 2), shAcct.Cells(ACCT_FIRST + n - 1, 6)).Value = arr
End Sub

' 원본 시트 2행부터 nCols 열을 대상 시트에 그대로 옮긴다. textCol 열은 글자(코드)로 맞춘다
Private Sub ReadBlock(ByVal src As Worksheet, ByVal nCols As Long, ByVal dst As Worksheet, _
                      ByVal r0 As Long, ByVal c0 As Long, ByVal rMax As Long, ByVal textCol As Long)
    Dim n As Long, arr As Variant, i As Long
    dst.Range(dst.Cells(r0, c0), dst.Cells(rMax, c0 + nCols - 1)).ClearContents
    n = LastDataRow(src, 1) - 1
    If n <= 0 Then Exit Sub
    If n > rMax - r0 + 1 Then n = rMax - r0 + 1
    arr = src.Range(src.Cells(2, 1), src.Cells(n + 1, nCols)).Value
    If textCol > 0 Then
        For i = 1 To n
            arr(i, textCol) = Trim(CStr(arr(i, textCol)))
        Next i
    End If
    dst.Range(dst.Cells(r0, c0), dst.Cells(r0 + n - 1, c0 + nCols - 1)).Value = arr
End Sub

' ----- 저장 -----
Public Sub SaveData()
    DoSave True
End Sub

Public Function DoSave(ByVal showMsg As Boolean) As Boolean
    Dim y As Long, p As String, tmp As String, bk As String, nb As Workbook, stage As String, msg As String
    y = LoadedYear()
    If y = 0 Then
        Warn "열려 있는 연도 데이터가 없습니다. [새 연도 만들기]로 먼저 만드세요."
        Exit Function
    End If
    On Error GoTo Fail
    stage = "폴더 확인"
    EnsureFolders
    p = YearFile(y)
    tmp = DataFolder() & Application.PathSeparator & "~saving_" & y & ".xlsx"
    BeginWork
    Application.Calculate
    AddLog "저장"
    stage = "저장 파일 만들기"
    Set nb = BuildDataWorkbook(y)
    Application.DisplayAlerts = False
    If FileExists(tmp) Then Kill tmp
    nb.SaveAs Filename:=tmp, FileFormat:=51
    nb.Close SaveChanges:=False
    Set nb = Nothing
    Application.DisplayAlerts = True
    stage = "이전 파일 백업"
    If FileExists(p) Then
        bk = BackupFolder() & Application.PathSeparator & "budget_" & y & "_" & Stamp(True) & ".xlsx"
        FileCopy p, bk
        Kill p
    End If
    stage = "새 파일로 바꾸기"
    Name tmp As p
    PruneBackups y
    shSys.Range("B3").Value = p
    shSys.Range("B4").Value = False
    shSys.Range("B5").Value = Left(Stamp(), 16)
    RefreshYearList
    EndWork
    DoSave = True
    If showMsg Then
        msg = "저장했습니다." & vbCrLf & p
        If Len(bk) > 0 Then msg = msg & vbCrLf & vbCrLf & "이전 파일은 backup 폴더에 보관했습니다."
        Info msg
    End If
    Exit Function
Fail:
    msg = Err.Description
    On Error Resume Next
    Application.DisplayAlerts = True
    If Not nb Is Nothing Then nb.Close SaveChanges:=False
    EndWork True
    Warn "저장하지 못했습니다. (" & stage & " " & mStage & ")" & vbCrLf & msg & vbCrLf & vbCrLf & _
         "다른 사람이 데이터 파일을 열고 있지 않은지 확인하세요."
End Function

Private Function BuildDataWorkbook(ByVal y As Long) As Workbook
    Dim nb As Workbook, ws As Worksheet, arr As Variant, n As Long, hdr As Variant
    Set nb = Workbooks.Add(xlWBATWorksheet)

    mStage = "정보 시트"
    Set ws = nb.Worksheets(1)
    mStage = "정보 시트 이름"
    ws.Name = SH_INFO
    mStage = "정보 값"
    arr = InfoArray(y)
    mStage = "정보 쓰기"
    ws.Range("A1:B12").Value = arr
    mStage = "정보 서식"
    FinishSheet ws, 2

    mStage = "계정 시트"
    Set ws = AddSheet(nb, SH_ACCT)
    ws.Range("A1:E1").Value = Array("코드", "대분류", "중분류", "소분류", "메모")
    ws.Columns(1).NumberFormat = "@"
    arr = AccountRows(n)
    If n > 0 Then ws.Range("A2").Resize(n, 5).Value = arr
    FinishSheet ws, 5

    mStage = "계획 시트"
    Set ws = AddSheet(nb, SH_PLAN)
    hdr = PlanHeaders()
    ws.Range("A1").Resize(1, PC_LAST).Value = hdr
    ws.Columns(1).NumberFormat = "@"
    arr = PlanRowsFromSheet(n)
    If n > 0 Then ws.Range("A2").Resize(n, PC_LAST).Value = arr
    ws.Range("E:E,H:H,K:L,AB:AM").NumberFormat = "#,##0"
    ws.Range("G:G,M:M").NumberFormat = "0.0%"
    FinishSheet ws, PC_LAST

    mStage = "실적 시트"
    Set ws = AddSheet(nb, SH_LED)
    ws.Range("A1:K1").Value = Array("ID", "월", "일자", "코드", "계정", "금액", "거래처", "비고", "출처", "입력시각", "입력자")
    ws.Columns(4).NumberFormat = "@"
    n = LedgerCount()
    If n > 0 Then ws.Range("A2").Resize(n, 11).Value = shLedger.Cells(LED_FIRST, 2).Resize(n, 11).Value
    ws.Columns(6).NumberFormat = "#,##0"
    ws.Columns(3).NumberFormat = "yyyy-mm-dd"
    ws.Columns(10).NumberFormat = "yyyy-mm-dd hh:mm"
    FinishSheet ws, 11

    mStage = "이력 시트"
    Set ws = AddSheet(nb, SH_LOG)
    ws.Range("A1:C1").Value = Array("시각", "사용자", "내용")
    n = LogCount()
    If n > 0 Then ws.Range("A2").Resize(n, 3).Value = shLog.Range("A2").Resize(n, 3).Value
    FinishSheet ws, 3

    nb.Worksheets(1).Activate
    Set BuildDataWorkbook = nb
End Function

Private Function AddSheet(ByVal nb As Workbook, ByVal nm As String) As Worksheet
    Dim ws As Worksheet
    Set ws = nb.Worksheets.Add(After:=nb.Worksheets(nb.Worksheets.Count))
    ws.Name = nm
    Set AddSheet = ws
End Function

Private Sub FinishSheet(ByVal ws As Worksheet, ByVal nCols As Long)
    With ws.Range(ws.Cells(1, 1), ws.Cells(1, nCols))
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(27, 77, 62)
    End With
    ws.Range(ws.Cells(1, 1), ws.Cells(1, nCols)).EntireColumn.AutoFit
End Sub

Private Function InfoArray(ByVal y As Long) As Variant
    Dim a(1 To 12, 1 To 2) As Variant
    a(1, 1) = "항목": a(1, 2) = "값"
    a(2, 1) = "연도": a(2, 2) = y
    a(3, 1) = "저장시각": a(3, 2) = Stamp()
    a(4, 1) = "저장자": a(4, 2) = CurrentUser()
    a(5, 1) = "프로그램": a(5, 2) = APP_NAME & " " & APP_VER
    a(6, 1) = "표시단위": a(6, 2) = shHome.Range("C19").Value
    a(7, 1) = "반올림단위": a(7, 2) = shHome.Range("C20").Value
    a(8, 1) = "반올림방식": a(8, 2) = shHome.Range("C21").Value
    a(9, 1) = "기준월": a(9, 2) = shComp.Range("C5").Value
    a(10, 1) = "다음ID": a(10, 2) = shSys.Range("B6").Value
    a(11, 1) = "계정 수": a(11, 2) = AccountCount()
    a(12, 1) = "실적 건수": a(12, 2) = LedgerCount()
    InfoArray = a
End Function

Private Function PlanHeaders() As Variant
    Dim h(1 To 1, 1 To 41) As Variant, i As Long, first14 As Variant
    first14 = Array("코드", "대분류", "중분류", "소분류", "전년실적", "산출방식", "증감률", "금액단가", _
                 "인원수량", "개월", "산출금액", "확정계획액", "전년비", "분할")
    For i = 0 To 13
        h(1, i + 1) = first14(i)
    Next i
    For i = 1 To 12
        h(1, 14 + i) = "분할" & i & "월"
        h(1, 27 + i) = "계획" & i & "월"
    Next i
    h(1, 27) = "분할점검"
    h(1, 40) = "산출근거"
    h(1, 41) = "비고"
    PlanHeaders = h
End Function

' 계정관리 시트에서 코드가 있는 줄만 (n행 x 5열)
Private Function AccountRows(ByRef n As Long) As Variant
    Dim r As Long, out() As Variant, j As Long
    n = AccountCount()
    If n = 0 Then Exit Function
    ReDim out(1 To n, 1 To 5)
    n = 0
    For r = ACCT_FIRST To ACCT_LAST
        If Len(Trim(CStr(shAcct.Cells(r, 2).Value))) > 0 Then
            n = n + 1
            out(n, 1) = Trim(CStr(shAcct.Cells(r, 2).Value))
            For j = 2 To 5
                out(n, j) = shAcct.Cells(r, 1 + j).Value
            Next j
        End If
    Next r
    AccountRows = out
End Function

Public Function AccountCount() As Long
    Dim r As Long, n As Long
    For r = ACCT_FIRST To ACCT_LAST
        If Len(Trim(CStr(shAcct.Cells(r, 2).Value))) > 0 Then n = n + 1
    Next r
    AccountCount = n
End Function

Public Function LedgerCount() As Long
    Dim lastRow As Long
    On Error GoTo Alt
    LedgerCount = Application.WorksheetFunction.Count(shLedger.Range(shLedger.Cells(LED_FIRST, 2), shLedger.Cells(LED_LAST, 2)))
    Exit Function
Alt:
    lastRow = shLedger.Cells(LED_LAST + 1, 2).End(xlUp).Row
    If lastRow < LED_FIRST Then lastRow = LED_FIRST - 1
    LedgerCount = lastRow - LED_FIRST + 1
End Function

Private Sub PruneBackups(ByVal y As Long)
    Dim f As String, fl() As String, n As Long, i As Long, j As Long, t As String
    ReDim fl(1 To 1000)
    f = Dir(BackupFolder() & Application.PathSeparator & "budget_" & y & "_*.xlsx")
    Do While Len(f) > 0 And n < 1000
        n = n + 1
        fl(n) = f
        f = Dir()
    Loop
    If n <= BACKUP_KEEP Then Exit Sub
    For i = 1 To n - 1
        For j = i + 1 To n
            If fl(j) < fl(i) Then
                t = fl(i)
                fl(i) = fl(j)
                fl(j) = t
            End If
        Next j
    Next i
    For i = 1 To n - BACKUP_KEEP
        Kill BackupFolder() & Application.PathSeparator & fl(i)
    Next i
End Sub

' ----- 새 연도 -----
Public Sub NewYear()
    Dim cur As Long, v As Variant, y As Long, plan As Variant, n As Long, sums As Variant, i As Long
    cur = LoadedYear()
    If cur > 0 Then
        v = AskNumber("새로 만들 계획 연도를 입력하세요.", cur + 1)
    Else
        v = AskNumber("새로 만들 계획 연도를 입력하세요.", Year(Date) + 1)
    End If
    If VarType(v) = vbBoolean Then Exit Sub
    y = CLng(v)
    If y < 2000 Or y > 2100 Then
        Warn "2000 ~ 2100 사이 연도를 입력하세요."
        Exit Sub
    End If
    If FileExists(YearFile(y)) Then
        Warn y & "년 데이터가 이미 있습니다. [열기]로 여세요."
        Exit Sub
    End If
    If Not ConfirmLeave() Then Exit Sub
    If cur > 0 Then
        If Ask(cur & "년의 계정과 산출 방식을 그대로 이어받고," & vbCrLf & _
               cur & "년 실적 합계를 '전년 실적'으로 넣어 " & y & "년을 만듭니다." & vbCrLf & vbCrLf & _
               "계속할까요?") <> vbYes Then Exit Sub
    End If
    On Error GoTo Fail
    BeginWork
    plan = PlanArrayFromRange(shPlan, PLAN_FIRST, PLAN_LAST, PC_TYPE, n)
    If n > 0 Then
        sums = ActualSumsFor(plan, n)
        For i = 1 To n
            plan(i, 5) = sums(i)
        Next i
    End If
    shLedger.Range(shLedger.Cells(LED_FIRST, 2), shLedger.Cells(LED_LAST, 12)).ClearContents
    shLog.Range(shLog.Cells(2, 1), shLog.Cells(LOG_LAST, 3)).ClearContents
    shSys.Range("B6").Value = 1
    shSys.Range("B2").Value = y
    shSys.Range("B3").Value = YearFile(y)
    RenderAll plan, n
    If cur > 0 Then
        AddLog y & "년 새로 만듦 (" & cur & "년에서 이어받음)"
    Else
        AddLog y & "년 새로 만듦"
    End If
    EndWork
    If DoSave(False) Then
        shHome.Range("C12").Value = y
        Info y & "년 데이터를 만들었습니다." & vbCrLf & YearFile(y)
        GoPlan
    End If
    Exit Sub
Fail:
    Dim msg As String
    msg = Err.Description
    EndWork True
    Warn "새 연도를 만드는 중 문제가 생겼습니다." & vbCrLf & msg
    If cur > 0 Then
        If FileExists(YearFile(cur)) Then LoadYear cur
    End If
End Sub

' 데이터가 없을 때의 빈 화면
Public Sub ClearAll()
    Dim empty0 As Variant
    BeginWork
    shAcct.Range(shAcct.Cells(ACCT_FIRST, 2), shAcct.Cells(ACCT_LAST, 6)).ClearContents
    shLedger.Range(shLedger.Cells(LED_FIRST, 2), shLedger.Cells(LED_LAST, 12)).ClearContents
    shLog.Range(shLog.Cells(2, 1), shLog.Cells(LOG_LAST, 3)).ClearContents
    shSys.Range("B2:B5").ClearContents
    shSys.Range("B4").Value = False
    shSys.Range("B6").Value = 1
    RenderAll empty0, 0
    EndWork
End Sub
