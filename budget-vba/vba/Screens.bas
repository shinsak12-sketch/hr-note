Attribute VB_Name = "Screens"
Option Explicit

' ===== 화면 그리기 (사업비계획, 계획대비실적) 와 입력 처리 =====

' ----- 코드 → 줄 번호 찾기 (Collection 키) -----
Public Function BuildIndex(ByVal arr As Variant, ByVal n As Long, ByVal col As Long) As Collection
    Dim c As New Collection, i As Long
    On Error Resume Next
    For i = 1 To n
        c.Add i, "k" & Trim(CStr(arr(i, col)))
    Next i
    On Error GoTo 0
    Set BuildIndex = c
End Function

Public Function IndexOf(ByVal c As Collection, ByVal key As String) As Long
    On Error Resume Next
    IndexOf = c("k" & key)
    If Err.Number <> 0 Then IndexOf = 0
    On Error GoTo 0
End Function

' 시트의 계획 줄을 배열(n행 x 41열)로. typeCol > 0 이면 그 열이 "D"인 줄만
Public Function PlanArrayFromRange(ByVal ws As Worksheet, ByVal r1 As Long, ByVal r2 As Long, _
                                   ByVal typeCol As Long, ByRef n As Long) As Variant
    Dim src As Variant, out() As Variant, i As Long, j As Long, lastCol As Long, ok As Boolean
    n = 0
    If r2 < r1 Then Exit Function
    lastCol = PC_LAST
    If typeCol > lastCol Then lastCol = typeCol
    src = ws.Range(ws.Cells(r1, 1), ws.Cells(r2, lastCol)).Value
    ReDim out(1 To r2 - r1 + 1, 1 To PC_LAST)
    For i = 1 To r2 - r1 + 1
        ok = (Len(Trim(CStr(src(i, 1)))) > 0)
        If ok And typeCol > 0 Then ok = (CStr(src(i, typeCol)) = "D")
        If ok Then
            n = n + 1
            For j = 1 To PC_LAST
                out(n, j) = src(i, j)
            Next j
            out(n, 1) = Trim(CStr(src(i, 1)))
        End If
    Next i
    PlanArrayFromRange = out
End Function

' 저장용: 사업비계획 시트의 계정 줄 값 (n행 x 41열)
Public Function PlanRowsFromSheet(ByRef n As Long) As Variant
    PlanRowsFromSheet = PlanArrayFromRange(shPlan, PLAN_FIRST, PLAN_LAST, PC_TYPE, n)
End Function

' 계정관리 시트 → 코드순 정렬 배열 (n행 x 4열: 코드, 대, 중, 소)
Public Function SortedAccounts(ByRef n As Long) As Variant
    Dim r As Long, tmp() As Variant, i As Long, j As Long, k As Long, t As Variant
    n = 0
    ReDim tmp(1 To ACCT_LAST - ACCT_FIRST + 1, 1 To 4)
    For r = ACCT_FIRST To ACCT_LAST
        If Len(Trim(CStr(shAcct.Cells(r, 2).Value))) > 0 Then
            n = n + 1
            For k = 1 To 4
                tmp(n, k) = Trim(CStr(shAcct.Cells(r, 1 + k).Value))
            Next k
        End If
    Next r
    For i = 2 To n
        j = i
        Do While j > 1
            If tmp(j - 1, 1) <= tmp(j, 1) Then Exit Do
            For k = 1 To 4
                t = tmp(j, k)
                tmp(j, k) = tmp(j - 1, k)
                tmp(j - 1, k) = t
            Next k
            j = j - 1
        Loop
    Next i
    SortedAccounts = tmp
End Function

' 실적 원장 금액을 계획 배열의 코드별로 합산
Public Function ActualSumsFor(ByVal plan As Variant, ByVal n As Long) As Variant
    Dim sums() As Double, idx As Collection, m As Long, arr As Variant, i As Long, k As Long
    ReDim sums(1 To n)
    Set idx = BuildIndex(plan, n, 1)
    m = LedgerCount()
    If m > 0 Then
        arr = shLedger.Cells(LED_FIRST, 2).Resize(m, 11).Value
        For i = 1 To m
            k = IndexOf(idx, Trim(CStr(arr(i, 4))))
            If k > 0 And IsNumeric(arr(i, 6)) Then sums(k) = sums(k) + CDbl(arr(i, 6))
        Next i
    End If
    ActualSumsFor = sums
End Function

Public Sub RenderAll(ByVal plan As Variant, ByVal n As Long)
    RenderPlan plan, n
    RenderComp
    RefreshAcctList
    Application.Calculate
End Sub

' ----- 사업비계획 시트 -----
Private Function PlanFormulaCols() As Variant
    PlanFormulaCols = Array(11, 12, 13, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40)
End Function

Private Function PlanSumCols() As Variant
    PlanSumCols = Array(5, 11, 12, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39)
End Function

Public Sub RenderPlan(ByVal plan As Variant, ByVal n As Long)
    Dim acc As Variant, na As Long, i As Long, r As Long, a As Long, grp As String
    Dim idx As Collection, tpl(1 To 42) As String, fc As Variant
    For Each fc In PlanFormulaCols()
        tpl(fc) = shSys.Cells(TPL_PLAN_ROW, fc).FormulaR1C1
    Next fc
    If n > 0 Then
        Set idx = BuildIndex(plan, n, 1)
    Else
        Set idx = New Collection
    End If
    acc = SortedAccounts(na)
    With shPlan
        .Rows(PLAN_FIRST & ":" & PLAN_LAST).Hidden = False
        .Range(.Cells(PLAN_FIRST, 1), .Cells(PLAN_LAST, PC_TYPE)).ClearContents
        .Range(.Cells(PLAN_FIRST, 1), .Cells(PLAN_LAST, PC_TYPE)).Locked = True
        r = PLAN_FIRST
        i = 1
        Do While i <= na
            grp = acc(i, 2)
            a = r
            Do While i <= na
                If acc(i, 2) <> grp Then Exit Do
                If r > PLAN_LAST - 2 Then Exit Do
                WritePlanRow r, acc, i, plan, IndexOf(idx, CStr(acc(i, 1)))
                r = r + 1
                i = i + 1
            Loop
            If r > a Then
                For Each fc In PlanFormulaCols()
                    .Range(.Cells(a, fc), .Cells(r - 1, fc)).FormulaR1C1 = tpl(fc)
                Next fc
                .Range(.Cells(a, 5), .Cells(r - 1, 10)).Locked = False
                .Range(.Cells(a, 14), .Cells(r - 1, 26)).Locked = False
                .Range(.Cells(a, 41), .Cells(r - 1, 41)).Locked = False
                WritePlanTotal r, a, r - 1, grp & " 소계", "S"
                r = r + 1
            End If
            If r > PLAN_LAST - 2 Then Exit Do
        Loop
        WritePlanTotal r, PLAN_FIRST, r - 1, "합계", "T"
        If r + 2 <= PLAN_LAST Then .Rows((r + 2) & ":" & PLAN_LAST).Hidden = True
    End With
End Sub

Private Sub WritePlanRow(ByVal r As Long, ByVal acc As Variant, ByVal i As Long, ByVal plan As Variant, ByVal k As Long)
    Dim j As Long
    With shPlan
        .Cells(r, 1).Value = CStr(acc(i, 1))
        .Cells(r, 2).Value = acc(i, 2)
        .Cells(r, 3).Value = acc(i, 3)
        .Cells(r, 4).Value = acc(i, 4)
        .Cells(r, PC_TYPE).Value = "D"
        If k > 0 Then
            For j = 5 To 10
                .Cells(r, j).Value = plan(k, j)
            Next j
            For j = 14 To 26
                .Cells(r, j).Value = plan(k, j)
            Next j
            .Cells(r, 41).Value = plan(k, 41)
        Else
            .Cells(r, 5).Value = 0
            .Cells(r, 6).Value = "%증감"
            .Cells(r, 7).Value = 0
            .Cells(r, 14).Value = "균등"
        End If
    End With
End Sub

Private Sub WritePlanTotal(ByVal r As Long, ByVal a As Long, ByVal b As Long, ByVal label As String, ByVal typ As String)
    Dim c As Variant
    With shPlan
        .Cells(r, 2).Value = label
        .Cells(r, PC_TYPE).Value = typ
        For Each c In PlanSumCols()
            If b >= a Then
                .Cells(r, c).FormulaR1C1 = "=SUBTOTAL(9,R" & a & "C:R" & b & "C)"
            Else
                .Cells(r, c).Value = 0
            End If
        Next c
        .Cells(r, 13).FormulaR1C1 = "=IF(RC5=0,"""",RC12/RC5-1)"
    End With
End Sub

' ----- 계획대비실적 시트: 사업비계획과 같은 순서·묶음으로 -----
Private Function CompFormulaCols() As Variant
    CompFormulaCols = Array(4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17)
End Function

Public Sub RenderComp()
    Dim r As Long, cr As Long, typ As String, tpl(1 To 17) As String, fc As Variant, a As Long, lastRow As Long
    For Each fc In CompFormulaCols()
        tpl(fc) = shSys.Cells(TPL_COMP_ROW, fc).FormulaR1C1
    Next fc
    With shComp
        .Rows(COMP_FIRST & ":" & COMP_LAST).Hidden = False
        .Range(.Cells(COMP_FIRST, 1), .Cells(COMP_LAST, CC_LAST)).ClearContents
        a = COMP_FIRST
        lastRow = COMP_FIRST
        For r = PLAN_FIRST To PLAN_LAST
            typ = CStr(shPlan.Cells(r, PC_TYPE).Value)
            If Len(typ) = 0 Then Exit For
            cr = COMP_FIRST + (r - PLAN_FIRST)
            .Cells(cr, CC_TYPE).Value = typ
            If typ = "D" Then
                .Cells(cr, 1).Value = CStr(shPlan.Cells(r, 1).Value)
                .Cells(cr, 2).Value = shPlan.Cells(r, 2).Value
                .Cells(cr, 3).Value = shPlan.Cells(r, 4).Value
                For Each fc In CompFormulaCols()
                    .Cells(cr, fc).FormulaR1C1 = tpl(fc)
                Next fc
            Else
                .Cells(cr, 2).Value = shPlan.Cells(r, 2).Value
                If typ = "T" Then
                    WriteCompTotal cr, COMP_FIRST, cr - 1
                Else
                    WriteCompTotal cr, a, cr - 1
                End If
                a = cr + 1
            End If
            lastRow = cr
        Next r
        If lastRow + 2 <= COMP_LAST Then .Rows((lastRow + 2) & ":" & COMP_LAST).Hidden = True
    End With
End Sub

Private Sub WriteCompTotal(ByVal cr As Long, ByVal a As Long, ByVal b As Long)
    Dim c As Variant
    With shComp
        For Each c In Array(4, 5, 6, 7, 9, 10, 11, 14)
            If b >= a Then
                .Cells(cr, c).FormulaR1C1 = "=SUBTOTAL(9,R" & a & "C:R" & b & "C)"
            Else
                .Cells(cr, c).Value = 0
            End If
        Next c
        .Cells(cr, 8).FormulaR1C1 = "=IF(RC5=0,"""",RC6/RC5)"
        .Cells(cr, 12).FormulaR1C1 = "=IF(RC9=0,"""",RC10/RC9)"
        .Cells(cr, 13).FormulaR1C1 = "=IF(RC4=0,"""",RC10/RC4)"
    End With
End Sub

' 실적 입력 화면의 계정 목록 (SYS!H2 아래, "코드 소분류")
Public Sub RefreshAcctList()
    Dim r As Long, k As Long
    shSys.Range("H2:H600").ClearContents
    k = 1
    For r = PLAN_FIRST To PLAN_LAST
        If Len(CStr(shPlan.Cells(r, PC_TYPE).Value)) = 0 Then Exit For
        If shPlan.Cells(r, PC_TYPE).Value = "D" Then
            k = k + 1
            shSys.Cells(k, 8).Value = CStr(shPlan.Cells(r, 1).Value) & " " & shPlan.Cells(r, 4).Value
        End If
    Next r
End Sub

' ----- 계정관리 [계획에 반영] -----
Public Sub ApplyAccounts()
    Dim acc As Variant, na As Long, i As Long, seen As New Collection, plan As Variant, n As Long
    Dim missing As Long, msg As String
    If Not RequireYear() Then Exit Sub
    acc = SortedAccounts(na)
    If na = 0 Then
        Warn "계정이 하나도 없습니다."
        Exit Sub
    End If
    For i = 1 To na
        If IndexOf(seen, CStr(acc(i, 1))) > 0 Then
            Warn "코드가 겹칩니다: " & acc(i, 1)
            Exit Sub
        End If
        If Len(acc(i, 2)) = 0 Or Len(acc(i, 4)) = 0 Then
            Warn "대분류와 소분류는 꼭 넣어야 합니다. (코드 " & acc(i, 1) & ")"
            Exit Sub
        End If
        seen.Add i, "k" & acc(i, 1)
    Next i
    plan = PlanRowsFromSheet(n)
    For i = 1 To n
        If IndexOf(seen, CStr(plan(i, 1))) = 0 Then
            missing = missing + 1
            If missing <= 10 Then msg = msg & vbCrLf & "  " & plan(i, 1) & " " & plan(i, 4)
        End If
    Next i
    If missing > 0 Then
        If Ask("아래 " & missing & "개 계정이 계정 목록에 없어서 계획에서 빠집니다." & msg & vbCrLf & vbCrLf & _
               "계속할까요?") <> vbYes Then Exit Sub
    End If
    BeginWork
    RenderAll plan, n
    MarkDirty
    AddLog "계정 반영 (" & na & "개)"
    EndWork
    Info "계획에 반영했습니다." & vbCrLf & "새 계정은 [사업비 계획]에서 산출 방식을 정하세요."
End Sub

' ----- 실적 입력 [등록] -----
Public Sub RegisterActual()
    Dim m As Variant, acct As String, code As String, nm As String, amt As Variant
    Dim r As Long, id As Long, sp As Long
    If Not RequireYear() Then Exit Sub
    m = shInput.Range("C6").Value
    acct = Trim(CStr(shInput.Range("C8").Value))
    amt = shInput.Range("C9").Value
    If IsEmpty(m) Or Not IsNumeric(m) Then
        Warn "월을 고르세요."
        Exit Sub
    End If
    If m < 1 Or m > 12 Or m <> Int(m) Then
        Warn "월은 1 ~ 12 중에서 고르세요."
        Exit Sub
    End If
    If Len(acct) = 0 Then
        Warn "계정을 고르세요."
        Exit Sub
    End If
    If IsError(Application.Match(acct, shSys.Range("H2:H600"), 0)) Then
        Warn "목록에 있는 계정을 고르세요."
        Exit Sub
    End If
    If IsEmpty(amt) Or Not IsNumeric(amt) Then
        Warn "금액을 원 단위 숫자로 넣으세요."
        Exit Sub
    End If
    If CDbl(amt) = 0 Then
        Warn "금액이 0입니다."
        Exit Sub
    End If
    sp = InStr(acct, " ")
    code = Left(acct, sp - 1)
    nm = Mid(acct, sp + 1)
    On Error GoTo Fail
    BeginWork
    On Error Resume Next
    If shLedger.FilterMode Then shLedger.ShowAllData
    On Error GoTo Fail
    id = Val(shSys.Range("B6").Value)
    If id < 1 Then id = 1
    r = LED_FIRST + LedgerCount()
    If r > LED_LAST Then Err.Raise vbObjectError + 2, , "실적 원장이 가득 찼습니다."
    With shLedger
        .Cells(r, 2).Value = id
        .Cells(r, 3).Value = CLng(m)
        If IsDate(shInput.Range("C7").Value) Then .Cells(r, 4).Value = CDate(shInput.Range("C7").Value)
        .Cells(r, 5).NumberFormat = "@"
        .Cells(r, 5).Value = code
        .Cells(r, 6).Value = nm
        .Cells(r, 7).Value = CDbl(amt)
        .Cells(r, 8).Value = shInput.Range("C10").Value
        .Cells(r, 9).Value = shInput.Range("C11").Value
        .Cells(r, 10).Value = "직접"
        .Cells(r, 11).Value = Now
        .Cells(r, 12).Value = CurrentUser()
    End With
    shSys.Range("B6").Value = id + 1
    AddLog "실적 등록 #" & id & "  " & CLng(m) & "월 " & code & " " & nm & "  " & Format(CDbl(amt), "#,##0") & "원"
    MarkDirty
    shInput.Range("C9").ClearContents
    shInput.Range("C10").ClearContents
    shInput.Range("C11").ClearContents
    shInput.Range("B14").Value = "등록했습니다.   #" & id & "   " & CLng(m) & "월   " & nm & "   " & Format(CDbl(amt), "#,##0") & "원"
    EndWork
    On Error Resume Next
    shInput.Range("C9").Select
    Exit Sub
Fail:
    EndWork True
    Warn "등록하지 못했습니다." & vbCrLf & Err.Description
End Sub

Public Sub ClearInputForm()
    shInput.Range("C7").ClearContents
    shInput.Range("C9").ClearContents
    shInput.Range("C10").ClearContents
    shInput.Range("C11").ClearContents
    shInput.Range("B14").Value = ""
End Sub

' ----- 실적 삭제 (실적 입력의 '최근 입력' 표 또는 실적 원장에서) -----
Public Sub DeleteSelectedActual()
    Dim ws As Worksheet, r As Long, id As Variant, pos As Variant, lr As Long, desc As String, lastRow As Long
    Set ws = ActiveSheet
    r = ActiveCell.Row
    If ws.Name = shInput.Name Then
        If r < 17 Or r > 31 Then
            Warn "아래 '최근 입력' 표에서 지울 줄을 먼저 클릭한 뒤 누르세요."
            Exit Sub
        End If
        id = shInput.Cells(r, 2).Value
    ElseIf ws.Name = shLedger.Name Then
        If r < LED_FIRST Then
            Warn "지울 줄을 먼저 클릭한 뒤 누르세요."
            Exit Sub
        End If
        id = shLedger.Cells(r, 2).Value
    Else
        Exit Sub
    End If
    If IsEmpty(id) Or Not IsNumeric(id) Then
        Warn "선택한 줄에 실적이 없습니다."
        Exit Sub
    End If
    If Len(CStr(id)) = 0 Then
        Warn "선택한 줄에 실적이 없습니다."
        Exit Sub
    End If
    pos = Application.Match(CDbl(id), shLedger.Range(shLedger.Cells(LED_FIRST, 2), shLedger.Cells(LED_LAST, 2)), 0)
    If IsError(pos) Then
        Warn "원장에서 실적 #" & id & " 을(를) 찾지 못했습니다."
        Exit Sub
    End If
    lr = LED_FIRST + pos - 1
    desc = "#" & id & "   " & shLedger.Cells(lr, 3).Value & "월   " & shLedger.Cells(lr, 6).Value & "   " & _
           Format(shLedger.Cells(lr, 7).Value, "#,##0") & "원"
    If Ask(desc & vbCrLf & vbCrLf & "이 실적을 삭제할까요?") <> vbYes Then Exit Sub
    On Error GoTo Fail
    BeginWork
    ' 아래 줄들을 한 칸씩 끌어올리고 마지막 줄을 비운다
    lastRow = LED_FIRST + LedgerCount() - 1
    If lr < lastRow Then
        shLedger.Range(shLedger.Cells(lr, 2), shLedger.Cells(lastRow - 1, 12)).Value = _
            shLedger.Range(shLedger.Cells(lr + 1, 2), shLedger.Cells(lastRow, 12)).Value
    End If
    shLedger.Range(shLedger.Cells(lastRow, 2), shLedger.Cells(lastRow, 12)).ClearContents
    AddLog "실적 삭제 " & desc
    MarkDirty
    If ws.Name = shInput.Name Then shInput.Range("B14").Value = "삭제했습니다.   " & desc
    EndWork
    Exit Sub
Fail:
    EndWork True
    Warn "삭제하지 못했습니다." & vbCrLf & Err.Description
End Sub
