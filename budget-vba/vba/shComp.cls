Option Explicit

Private Sub Worksheet_Change(ByVal Target As Range)
    If Not Intersect(Target, Me.Range("C5")) Is Nothing Then MarkDirty
End Sub
