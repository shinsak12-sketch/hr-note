Option Explicit

Private Sub Worksheet_Change(ByVal Target As Range)
    If Target.Row >= ACCT_FIRST Then MarkDirty
End Sub
